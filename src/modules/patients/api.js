// Accès aux données du registre des patients (étape 11). L'identité seulement : la fiche
// médicale passe par get_ / save_patient_medical (partie C). Le numéro de dossier est
// attribué par la base, jamais par l'application. Recherche et doublons : fonctions SQL
// search_patients et find_duplicate_candidates (sans accents, fautes tolérées, paginée).

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
  patient: (orgId, id) => ['patients', 'patient', orgId, id],
  doublons: (orgId, criteres) => ['patients', 'doublons', orgId, criteres],
}

const COLONNES_IDENTITE =
  'id, org_id, file_number, legacy_file_number, last_name, first_name, sex, birth_date, ' +
  'birth_date_estimated, birth_year, declared_age, age_declared_on, phone, phone_owner, ' +
  'phone_secondary, neighborhood, commune, mother_first_name, mother_last_name, ' +
  'preferred_language, whatsapp_consent, whatsapp_consent_at, merged_into_id, created_at'

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
export async function chargerPatient(id) {
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
