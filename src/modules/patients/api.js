// Accès aux données du registre des patients (étape 11) : identité, photo (bucket privé
// « patients », URL signée), couvertures, fiche médicale (uniquement par les fonctions
// get_ / save_patient_medical : jamais de lecture directe), journal des modifications
// de l'identité (audit_logs, owner et admin). Le numéro de dossier est
// attribué par la base, jamais par l'application. Recherche et doublons : fonctions SQL
// search_patients et find_duplicate_candidates (sans accents, fautes tolérées, paginée).
// Import d'une liste (owner et admin) : start_patient_import (journal), import_patients
// par lots de 500, find_import_duplicates (doublons de tout un lot en un appel). Page de
// registre papier recopiée (rôles qui créent un patient) : mêmes fonctions, source
// 'registre', 60 lignes au plus.

import { MESSAGE_INDISPONIBLE, traduireErreur } from '../../lib/erreursAuth.js'
import { supabase } from '../../lib/supabase.js'
import { messageErreurPatient } from './utils.js'

function client() {
  if (!supabase) throw new Error(MESSAGE_INDISPONIBLE)
  return supabase
}

export const PAR_PAGE = 20

export const cles = {
  permissions: (orgId) => ['patients', 'permissions', orgId],
  recherche: (orgId, q, page, parPage) => ['patients', 'recherche', orgId, q, page, parPage],
  patient: (id) => ['patients', 'patient', id],
  doublons: (orgId, criteres) => ['patients', 'doublons', orgId, criteres],
  photo: (chemin) => ['patients', 'photo', chemin],
  couvertures: (id) => ['patients', 'couvertures', id],
  tiersPayants: (orgId) => ['patients', 'tiers-payants', orgId],
  medical: (id) => ['patients', 'medical', id],
  journal: (id) => ['patients', 'journal', id],
  structureCarte: (orgId) => ['patients', 'structure-carte', orgId],
}

const COLONNES_IDENTITE =
  'id, org_id, file_number, legacy_file_number, last_name, first_name, sex, birth_date, ' +
  'birth_date_estimated, birth_year, declared_age, age_declared_on, phone, phone_owner, ' +
  'phone_secondary, neighborhood, commune, occupation, marital_status, mother_first_name, ' +
  'mother_last_name, emergency_contact_name, emergency_contact_phone, ' +
  'emergency_contact_relation, preferred_language, whatsapp_consent, whatsapp_consent_at, ' +
  'photo_path, merged_into_id, created_at, updated_at'

// Droits de l'utilisateur sur le registre (affichage seulement : la base décide).
// { read, write, medical, sensitive, merge, import }
export async function chargerPermissions(orgId) {
  const { data, error } = await client().rpc('patient_permissions', { p_org_id: orgId })
  if (error) throw traduireErreur(error, 'Vos droits sur le registre n’ont pas pu être lus.')
  return data ?? {}
}

// { lignes, total } — requête vide : derniers patients créés.
export async function rechercherPatients(orgId, requete, { page = 1, parPage = PAR_PAGE } = {}) {
  const { data, error } = await client().rpc('search_patients', {
    p_org_id: orgId,
    p_query: requete ?? '',
    p_limit: parPage,
    p_offset: (page - 1) * parPage,
  })
  if (error) throw traduireErreur(error, 'La recherche n’a pas abouti. Réessayez.')
  const lignes = data ?? []
  return { lignes, total: Number(lignes[0]?.total_count ?? 0) }
}

// Patients proches d'une saisie en cours. [] tant que nom et prénom ne sont pas saisis.
export async function chercherDoublons(orgId, { nom, prenom, telephone, mere, anneeNaissance }) {
  const { data, error } = await client().rpc('find_duplicate_candidates', {
    p_org_id: orgId,
    p_last_name: nom,
    p_first_name: prenom,
    p_phone: telephone || null,
    p_mother_first_name: mere || null,
    p_birth_year: anneeNaissance ?? null,
  })
  if (error) throw traduireErreur(error, 'La vérification des doublons n’a pas abouti.')
  return data ?? []
}

// Création de l'identité. Renvoie la ligne enregistrée, avec son numéro de dossier.
export async function creerPatient(orgId, ligne) {
  const { data, error } = await client()
    .from('patients')
    .insert({ ...ligne, org_id: orgId })
    .select(COLONNES_IDENTITE)
    .single()
  if (error) throw messageErreurPatient(error)
  return data
}

// Identité d'un patient. Un dossier fusionné renvoie au dossier conservé.
// null : dossier inexistant, ou dans une structure dont l'utilisateur n'est pas membre
// (la RLS ne renvoie rien : on ne distingue pas les deux cas).
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function chargerPatient(id) {
  if (!UUID.test(id ?? '')) return null
  let courant = id
  for (let saut = 0; saut < 3; saut += 1) {
    const { data, error } = await client()
      .from('patients')
      .select(COLONNES_IDENTITE)
      .eq('id', courant)
      .maybeSingle()
    if (error) throw traduireErreur(error, 'Le dossier n’a pas pu être chargé.')
    if (!data) return null
    if (!data.merged_into_id) return { ...data, fusionneDepuis: courant === id ? null : id }
    courant = data.merged_into_id
  }
  return null
}

// Modification de l'identité : seuls les champs changés sont envoyés. Chaque modification
// est journalisée par la base (audit_logs : auteur, date, ancienne et nouvelle valeur).
export async function modifierPatient(id, champs) {
  const { data, error } = await client()
    .from('patients')
    .update(champs)
    .eq('id', id)
    .select(COLONNES_IDENTITE)
    .maybeSingle()
  if (error) throw messageErreurPatient(error)
  if (!data) {
    throw new Error(
      'Modification refusée : ce dossier a été fusionné, ou la structure est en lecture seule.',
    )
  }
  return data
}

// --- Photo -------------------------------------------------------------------

const DUREE_URL_SIGNEE = 60 * 60 // secondes

export async function urlPhoto(chemin) {
  const { data, error } = await client()
    .storage.from('patients')
    .createSignedUrl(chemin, DUREE_URL_SIGNEE)
  if (error) throw traduireErreur(error, 'La photo n’a pas pu être affichée.')
  return data.signedUrl
}

// Une nouvelle photo a toujours un nouveau nom : rien n'est remplacé ni supprimé.
export async function envoyerPhoto(patient, blob) {
  const extension = blob.type === 'image/webp' ? 'webp' : 'jpg'
  const chemin = `${patient.org_id}/${patient.id}/photo-${Date.now()}.${extension}`
  const { error } = await client()
    .storage.from('patients')
    .upload(chemin, blob, { contentType: blob.type, upsert: false })
  if (error) throw traduireErreur(error, 'La photo n’a pas pu être envoyée. Réessayez.')
  return modifierPatient(patient.id, { photo_path: chemin })
}

// --- Couvertures -------------------------------------------------------------

export async function chargerCouvertures(patientId) {
  const { data, error } = await client()
    .from('patient_coverages')
    .select(
      'id, org_id, patient_id, scheme, payer_id, member_number, coverage_rate, valid_from, ' +
        'valid_to, created_at, payer:payers (id, name, kind)',
    )
    .eq('patient_id', patientId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
  if (error) throw traduireErreur(error, 'Les couvertures n’ont pas pu être chargées.')
  return data ?? []
}

// Tiers payants actifs de la structure (étape 7), pour le choix d'une couverture.
export async function chargerTiersPayants(orgId) {
  const { data, error } = await client()
    .from('payers')
    .select('id, kind, name, coverage_rate')
    .eq('org_id', orgId)
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('name')
  if (error) throw traduireErreur(error, 'Les tiers payants n’ont pas pu être chargés.')
  return data ?? []
}

function erreurCouverture(error) {
  if (error?.code === '23514') {
    return new Error('Vérifiez les dates : la fin de validité doit suivre le début.', {
      cause: error,
    })
  }
  return traduireErreur(error, 'La couverture n’a pas pu être enregistrée. Réessayez.')
}

export async function enregistrerCouverture(patient, couverture, id = null) {
  const requete = id
    ? client().from('patient_coverages').update(couverture).eq('id', id)
    : client()
        .from('patient_coverages')
        .insert({ ...couverture, org_id: patient.org_id, patient_id: patient.id })
  const { error } = await requete
  if (error) throw erreurCouverture(error)
}

// Retrait sans suppression : la couverture reste dans l'historique (deleted_at).
export async function retirerCouverture(id) {
  const { error } = await client()
    .from('patient_coverages')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw traduireErreur(error, 'La couverture n’a pas pu être retirée. Réessayez.')
}

// --- Fiche médicale ----------------------------------------------------------

// { blood_group, allergies, medical_history, is_sensitive, history_hidden, updated_at }
// ou null si aucune fiche. La lecture d'antécédents sensibles est journalisée par la base.
export async function chargerMedical(patientId) {
  const { data, error } = await client().rpc('get_patient_medical', { p_patient_id: patientId })
  if (error) throw traduireErreur(error, 'Les données médicales n’ont pas pu être chargées.')
  return data?.[0] ?? null
}

export async function enregistrerMedical(patientId, fiche) {
  const { error } = await client().rpc('save_patient_medical', {
    p_patient_id: patientId,
    p_blood_group: fiche.groupe || null,
    p_allergies: fiche.allergies,
    p_medical_history: fiche.antecedents,
    p_is_sensitive: fiche.sensible,
  })
  if (error) {
    throw traduireErreur(error, 'Les données médicales n’ont pas pu être enregistrées.')
  }
}

// --- Journal des modifications (owner et admin) -------------------------------

// [{ id, action, created_at, auteur, old_data, new_data }] — les plus récentes d'abord.
export async function chargerJournal(patientId) {
  const { data, error } = await client()
    .from('audit_logs')
    .select('id, action, user_id, created_at, old_data, new_data')
    .eq('table_name', 'patients')
    .eq('record_id', patientId)
    .order('created_at', { ascending: false })
    .limit(30)
  if (error) throw traduireErreur(error, 'Le journal des modifications n’a pas pu être chargé.')
  const ids = [...new Set((data ?? []).map((l) => l.user_id).filter(Boolean))]
  let noms = {}
  if (ids.length) {
    const profils = await client().from('profiles').select('id, full_name').in('id', ids)
    noms = Object.fromEntries((profils.data ?? []).map((p) => [p.id, p.full_name]))
  }
  return (data ?? []).map((l) => ({ ...l, auteur: noms[l.user_id] ?? null }))
}

// --- Carte patient -----------------------------------------------------------

// Nom, téléphone et logo de la structure, imprimés sur la carte.
export async function chargerStructureCarte(orgId) {
  const { data, error } = await client()
    .from('organizations')
    .select('id, name, phone, logo_url')
    .eq('id', orgId)
    .single()
  if (error) throw traduireErreur(error, 'Les informations de la structure n’ont pas pu être lues.')
  return data
}

// --- Import d'une liste (owner et admin) ou d'une page de registre -------------

// Doublons probables d'un lot (500 lignes au plus, 60 pour une page de registre) :
// [{ line, id, file_number, …, reason }].
export async function chercherDoublonsImport(orgId, criteres, source = 'fichier') {
  const { data, error } = await client().rpc('find_import_duplicates', {
    p_org_id: orgId,
    p_rows: criteres,
    p_source: source,
  })
  if (error) throw traduireErreur(error, 'La recherche des doublons n’a pas abouti. Réessayez.')
  return data ?? []
}

// Ouvre le journal de l'import (auteur et date fixés par la base). Renvoie son id.
// annee / page : repère facultatif d'une page de registre.
export async function commencerImport(
  orgId,
  { source = 'fichier', nomFichier = null, annee = null, page = null, total, refusees, ignorees },
) {
  const { data, error } = await client().rpc('start_patient_import', {
    p_org_id: orgId,
    p_file_name: nomFichier,
    p_total_rows: total,
    p_rejected_rows: refusees,
    p_skipped_rows: ignorees,
    p_source: source,
    p_register_year: annee,
    p_register_page: page,
  })
  if (error) throw traduireErreur(error, 'L’import n’a pas pu commencer. Réessayez.')
  return data
}

// Un lot de 500 lignes au plus (60 pour une page de registre) : [{ line, patient_id, file_number, error }].
export async function importerLot(orgId, importId, lignes) {
  const { data, error } = await client().rpc('import_patients', {
    p_org_id: orgId,
    p_rows: lignes,
    p_import_id: importId,
  })
  if (error) throw traduireErreur(error, 'Ce lot n’a pas pu être enregistré.')
  return data ?? []
}
