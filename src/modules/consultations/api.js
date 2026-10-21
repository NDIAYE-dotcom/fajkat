// Accès aux données des consultations (étape 14, feature consultations). Partie B : écran
// de consultation — démarrer, enregistrer le brouillon, reprendre, valider, avenants ;
// diagnostics (recherche, favoris), examens rapides, types de consultation. Partie C :
// antécédents, chronologie du dossier. Partie E : références et contre-références,
// certificats, prochain rendez-vous pris depuis la consultation.
// Le contenu médical ne se lit que par get_encounter (aucune lecture directe des tables) :
// la base refuse l'accueil, le caissier, le comptable et l'owner qui n'exerce pas.

import { estErreurReseau, MESSAGE_INDISPONIBLE, traduireErreur } from '../../lib/erreursAuth.js'
import { supabase } from '../../lib/supabase.js'

function client() {
  if (!supabase) throw new Error(MESSAGE_INDISPONIBLE)
  return supabase
}

export const cles = {
  permissions: (orgId) => ['consultations', 'permissions', orgId],
  consultation: (id) => ['consultations', 'consultation', id],
  types: (orgId) => ['consultations', 'types', orgId],
  examens: (orgId) => ['consultations', 'examens', orgId],
  diagnostics: (orgId, texte) => ['consultations', 'diagnostics', orgId, texte],
  favoris: (orgId) => ['consultations', 'diagnostics', orgId, ''],
  mesBrouillons: (orgId) => ['consultations', 'mes-brouillons', orgId],
  antecedents: (patientId) => ['consultations', 'antecedents', patientId],
  chronologie: (patientId, types) => ['consultations', 'chronologie', patientId, types],
  formes: () => ['consultations', 'formes'],
  voies: () => ['consultations', 'voies'],
  medicaments: (orgId, texte) => ['consultations', 'medicaments', orgId, texte],
  enTeteStructure: (orgId) => ['consultations', 'en-tete', orgId],
  qualites: (consultationId) => ['consultations', 'qualites', consultationId],
  destinations: (orgId) => ['consultations', 'destinations', orgId],
  references: (orgId, statut) => ['consultations', 'references', orgId, statut],
  toutesReferences: (orgId) => ['consultations', 'references', orgId],
  reference: (id) => ['consultations', 'reference', id],
  modelesCertificat: (orgId) => ['consultations', 'modeles-certificat', orgId],
  certificat: (id) => ['consultations', 'certificat', id],
  suivis: (consultationId) => ['consultations', 'suivis', consultationId],
}

// Erreur d'une fonction de la base. Les refus métier (22023, 42501 levés par nos
// fonctions) gardent leur message en français ; conflit : version dépassée (autre
// appareil, indice « version_conflict ») ; reseau : coupure, la saisie reste sur
// l'appareil.
function erreurConsultation(error, repli) {
  let traduite
  if (
    error?.code === '42501' &&
    error.message &&
    !/permission denied|row-level/i.test(error.message)
  ) {
    traduite = new Error(error.message, { cause: error })
    traduite.code = error.code
  } else {
    traduite = traduireErreur(error, repli)
  }
  traduite.conflit = error?.hint === 'version_conflict'
  traduite.reseau = estErreurReseau(error)
  return traduite
}

async function appeler(fonction, parametres, repli) {
  const { data, error } = await client().rpc(fonction, parametres)
  if (error) throw erreurConsultation(error, repli)
  return data
}

// { read, write, sensitive, configure, references } — affichage seulement.
export async function chargerPermissions(orgId) {
  return (
    (await appeler(
      'encounter_permissions',
      { p_org_id: orgId },
      'Vos droits sur les consultations n’ont pas pu être lus.',
    )) ?? {}
  )
}

// Commence une consultation, ou renvoie le brouillon déjà ouvert pour ce passage
// (« mine » faux s'il est tenu par un autre soignant).
export function commencerConsultation(patientId, visiteId = null) {
  return appeler(
    'start_encounter',
    { p_patient_id: patientId, p_visit_id: visiteId },
    'La consultation n’a pas pu être ouverte.',
  )
}

// En-tête, brouillon (son auteur seulement) ou contenu validé, documents, constantes du
// passage, reprises. ouverture : identifiant tiré à l'ouverture de l'écran ; la base
// n'enregistre qu'une lecture par ouverture d'une consultation sensible.
export function chargerConsultation(id, ouverture = null) {
  return appeler(
    'get_encounter',
    { p_encounter_id: id, p_opening_id: ouverture },
    'La consultation n’a pas pu être lue.',
  )
}

// Enregistre le brouillon : { version, saved_at, is_sensitive }.
export function enregistrerBrouillon(id, version, contenu) {
  return appeler(
    'save_encounter_draft',
    { p_encounter_id: id, p_version: version, p_data: contenu },
    'Le brouillon n’a pas pu être enregistré sur le serveur.',
  )
}

export function reprendreConsultation(id) {
  return appeler(
    'take_over_encounter',
    { p_encounter_id: id },
    'La consultation n’a pas pu être reprise.',
  )
}

export function abandonnerBrouillon(id, version) {
  return appeler(
    'discard_encounter_draft',
    { p_encounter_id: id, p_version: version },
    'Le brouillon n’a pas pu être abandonné.',
  )
}

export function validerConsultation(id, version) {
  return appeler(
    'validate_encounter',
    { p_encounter_id: id, p_version: version },
    'La consultation n’a pas pu être validée.',
  )
}

export function ajouterAvenant(id, texte) {
  return appeler(
    'add_encounter_addendum',
    { p_encounter_id: id, p_body: texte },
    'L’avenant n’a pas pu être enregistré.',
  )
}

export async function chargerMesBrouillons(orgId) {
  return (
    (await appeler(
      'my_draft_encounters',
      { p_org_id: orgId },
      'Vos consultations en cours n’ont pas pu être lues.',
    )) ?? []
  )
}

// --- Référentiels de la structure ---------------------------------------------------------

export async function chargerTypes(orgId) {
  const { data, error } = await client()
    .from('encounter_types')
    .select('id, label, is_sensitive_default, is_active, sort_order')
    .eq('org_id', orgId)
    .is('deleted_at', null)
    .order('sort_order')
  if (error) throw traduireErreur(error, 'Les types de consultation n’ont pas pu être lus.')
  return data ?? []
}

export async function chargerExamens(orgId) {
  const { data, error } = await client()
    .from('rapid_test_types')
    .select('id, label, result_kind, unit, is_sensitive, is_active, sort_order')
    .eq('org_id', orgId)
    .is('deleted_at', null)
    .order('sort_order')
  if (error) throw traduireErreur(error, 'Les examens rapides n’ont pas pu être lus.')
  return data ?? []
}

// --- Ordonnance (partie D) ----------------------------------------------------------------

// Formes des médicaments (référentiel commun) : counted -> quantité calculée à l'unité.
export async function chargerFormes() {
  const { data, error } = await client()
    .from('drug_forms')
    .select('code, label, dose_unit, dose_unit_plural, counted, pack_unit, pack_unit_plural')
    .eq('is_active', true)
    .order('sort_order')
  if (error) throw traduireErreur(error, 'Les formes des médicaments n’ont pas pu être lues.')
  return data ?? []
}

export async function chargerVoies() {
  const { data, error } = await client()
    .from('drug_routes')
    .select('code, label')
    .eq('is_active', true)
    .order('sort_order')
  if (error) throw traduireErreur(error, 'Les voies d’administration n’ont pas pu être lues.')
  return data ?? []
}

// Noms déjà prescrits dans la structure (soignants qui rédigent) :
// [{ product_name, dosage, form, route_code, uses, product_id, stock }].
// product_id et stock : catalogue de la pharmacie, étape 17 (toujours nuls).
export async function suggererMedicaments(orgId, texte) {
  return (
    (await appeler(
      'prescription_name_suggestions',
      { p_org_id: orgId, p_query: texte, p_limit: 8 },
      'Les suggestions de médicaments n’ont pas pu être lues.',
    )) ?? []
  )
}

// Qualité de qui a prescrit chaque ordonnance d'une consultation (« Infirmier chef de
// poste ») : { [prescription_id]: qualité }. Soignants qui impriment seulement.
export async function chargerQualites(consultationId) {
  const lignes =
    (await appeler(
      'prescription_prescriber_titles',
      { p_encounter_id: consultationId },
      'La qualité du praticien n’a pas pu être lue.',
    )) ?? []
  return Object.fromEntries(lignes.map((l) => [l.prescription_id, l.prescriber_title]))
}

// En-tête imprimé de l'ordonnance : nom, adresse, téléphone, logo de la structure.
export async function chargerEnTeteStructure(orgId) {
  const { data, error } = await client()
    .from('organizations')
    .select('name, address, phone, authorization_number, logo_url')
    .eq('id', orgId)
    .single()
  if (error) throw traduireErreur(error, 'L’en-tête de la structure n’a pas pu être lu.')
  return data
}

// --- Diagnostics --------------------------------------------------------------------------

// Sans texte : favoris du soignant.
export async function chercherDiagnostics(orgId, texte) {
  return (
    (await appeler(
      'search_diagnoses',
      { p_org_id: orgId, p_query: texte ?? '', p_limit: 15 },
      'La recherche des diagnostics n’a pas abouti.',
    )) ?? []
  )
}

export function marquerFavori(orgId, catalogueId, favori) {
  return appeler(
    'set_diagnosis_favorite',
    { p_org_id: orgId, p_catalog_id: catalogueId, p_on: favori },
    'Le favori n’a pas pu être enregistré.',
  )
}

// --- Antécédents (soignants ; sensibles réservés aux habilités) ----------------------------

// [{ id, category, label, details, since_year, is_sensitive, created_at, author_name }].
// ouverture : comme chargerConsultation (une lecture journalisée par ouverture).
export async function chargerAntecedents(patientId, ouverture = null) {
  return (
    (await appeler(
      'get_medical_history',
      { p_patient_id: patientId, p_opening_id: ouverture },
      'Les antécédents n’ont pas pu être lus.',
    )) ?? []
  )
}

// Ajout (id absent) ou modification. consultationId : consultation d'où vient l'ajout.
export function enregistrerAntecedent(patientId, a, consultationId = null) {
  return appeler(
    'save_medical_history_item',
    {
      p_patient_id: patientId,
      p_id: a.id ?? null,
      p_category: a.category,
      p_label: a.label,
      p_details: a.details || null,
      p_since_year: a.since_year ?? null,
      p_is_sensitive: Boolean(a.is_sensitive),
      p_encounter_id: consultationId,
    },
    'L’antécédent n’a pas pu être enregistré.',
  )
}

// Retiré, jamais effacé.
export function retirerAntecedent(id) {
  return appeler(
    'remove_medical_history_item',
    { p_id: id },
    'L’antécédent n’a pas pu être retiré.',
  )
}

// --- Chronologie du dossier ----------------------------------------------------------------

export const PAGE_CHRONOLOGIE = 20

// Une page : { lignes, suite } ; suite : curseur de la page suivante, null à la fin.
// types : null (tout ce que le rôle peut voir) ou ['encounter', 'appointment'…].
export async function chargerChronologie(patientId, types, curseur = null) {
  const lignes =
    (await appeler(
      'patient_timeline',
      {
        p_patient_id: patientId,
        p_kinds: types,
        p_before_at: curseur?.at ?? null,
        p_before_id: curseur?.id ?? null,
        p_limit: PAGE_CHRONOLOGIE + 1,
      },
      'La chronologie du dossier n’a pas pu être lue.',
    )) ?? []
  const page = lignes.slice(0, PAGE_CHRONOLOGIE)
  const derniere = page.at(-1)
  return {
    lignes: page,
    suite:
      lignes.length > PAGE_CHRONOLOGIE ? { at: derniere.occurred_at, id: derniere.item_id } : null,
  }
}

// --- Références, certificats, prochain rendez-vous (partie E) ------------------------------
// Contenu lu par des fonctions réservées aux soignants qui rédigent : la base refuse
// l'accueil, le caissier, le comptable et l'owner qui n'exerce pas.

// Établissements de référence (Paramètres → Références, et liste de la lettre).
export async function chargerDestinations(orgId) {
  const { data, error } = await client()
    .from('referral_destinations')
    .select('id, name, kind, phone, address, is_active, sort_order')
    .eq('org_id', orgId)
    .is('deleted_at', null)
    .order('sort_order')
    .order('name')
  if (error) throw traduireErreur(error, 'Les établissements de référence n’ont pas pu être lus.')
  return data ?? []
}

function erreurReglage(error, repli) {
  if (error?.code === '23505') return new Error('Cet établissement existe déjà.')
  if (error?.code === '23514')
    return new Error('Vérifiez les cases : une valeur n’est pas acceptée.')
  if (error?.code === '42501') return new Error('Votre rôle ne permet pas cette modification.')
  return traduireErreur(error, repli)
}

// d : { id?, name, kind, phone, address, is_active } ; renvoie la ligne enregistrée.
export async function enregistrerDestination(orgId, d) {
  const champs = {
    name: d.name.trim(),
    kind: d.kind || 'autre',
    phone: d.phone || null,
    address: d.address?.trim() || null,
    is_active: d.is_active ?? true,
  }
  const requete = d.id
    ? client().from('referral_destinations').update(champs).eq('id', d.id)
    : client()
        .from('referral_destinations')
        .insert({ ...champs, org_id: orgId })
  const { data, error } = await requete.select('id, name, kind, phone, address, is_active')
  if (error) throw erreurReglage(error, 'L’établissement n’a pas pu être enregistré.')
  if (!data?.length) throw new Error('Votre rôle ne permet pas cette modification.')
  return data[0]
}

// Retiré de la liste, jamais effacé (les lettres déjà émises gardent son nom).
export async function retirerDestination(id) {
  const { data, error } = await client()
    .from('referral_destinations')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .select('id')
  if (error) throw erreurReglage(error, 'L’établissement n’a pas pu être retiré.')
  if (!data?.length) throw new Error('Votre rôle ne permet pas cette modification.')
}

// r : { destinationId, destinationNom, urgent, motif, resume, traitements } -> id.
export function creerReference(consultationId, r) {
  return appeler(
    'create_referral',
    {
      p_encounter_id: consultationId,
      p_destination_id: r.destinationId || null,
      p_destination_name: r.destinationId ? null : r.destinationNom.trim(),
      p_urgency: r.urgent ? 'urgent' : 'routine',
      p_reason: r.motif.trim(),
      p_summary: r.resume.trim() || null,
      p_treatments_given: r.traitements.trim() || null,
    },
    'La référence n’a pas été enregistrée.',
  )
}

// Une référence (impression, contre-référence) ; lecture journalisée si elle est sensible.
export function chargerReference(id, ouverture = null) {
  return appeler(
    'get_referral',
    { p_referral_id: id, p_opening_id: ouverture },
    'La référence n’a pas pu être lue.',
  )
}

// statut : 'pending' (en attente de retour) | 'returned' (contre-référence reçue).
export async function listerReferences(orgId, statut) {
  return (
    (await appeler(
      'list_referrals',
      { p_org_id: orgId, p_status: statut, p_limit: 200 },
      'Les références n’ont pas pu être lues.',
    )) ?? []
  )
}

// c : { date (AAAA-MM-JJ), structure, diagnostic, traitement, conduite, suivi }.
export function enregistrerContreReference(id, c) {
  return appeler(
    'record_counter_referral',
    {
      p_referral_id: id,
      p_received_on: c.date,
      p_from_name: c.structure || null,
      p_diagnosis: c.diagnostic || null,
      p_treatment: c.traitement || null,
      p_plan: c.conduite || null,
      p_followup: c.suivi || null,
    },
    'La contre-référence n’a pas été enregistrée.',
  )
}

// Modèles de certificat (Paramètres → Certificats, et choix du modèle).
export async function chargerModelesCertificat(orgId) {
  const { data, error } = await client()
    .from('certificate_templates')
    .select('id, template_code, label, body, has_days, is_active, sort_order')
    .eq('org_id', orgId)
    .is('deleted_at', null)
    .order('sort_order')
  if (error) throw traduireErreur(error, 'Les modèles de certificat n’ont pas pu être lus.')
  return data ?? []
}

// m : { id?, label, body, has_days, is_active }.
export async function enregistrerModeleCertificat(orgId, m) {
  const champs = {
    label: m.label.trim(),
    body: m.body.trim(),
    has_days: Boolean(m.has_days),
    is_active: m.is_active ?? true,
  }
  const requete = m.id
    ? client().from('certificate_templates').update(champs).eq('id', m.id)
    : client()
        .from('certificate_templates')
        .insert({ ...champs, org_id: orgId, sort_order: m.sort_order ?? 100 })
  const { data, error } = await requete.select('id')
  if (error?.code === '23514') {
    throw new Error(
      'Le texte contient une variable inconnue entre accolades : utilisez seulement celles de la liste.',
    )
  }
  if (error) throw erreurReglage(error, 'Le modèle n’a pas pu être enregistré.')
  if (!data?.length) throw new Error('Votre rôle ne permet pas cette modification.')
}

// c : { modeleId, titre, texte, jours, debut } -> id du certificat (numéroté par la base).
export function emettreCertificat(consultationId, c) {
  return appeler(
    'issue_certificate',
    {
      p_encounter_id: consultationId,
      p_template_id: c.modeleId || null,
      p_title: c.titre.trim(),
      p_body: c.texte.trim(),
      p_rest_days: c.jours ?? null,
      p_starts_on: c.debut ?? null,
      p_includes_diagnosis: false,
    },
    'Le certificat n’a pas été émis.',
  )
}

export function chargerCertificat(id, ouverture = null) {
  return appeler(
    'get_certificate',
    { p_certificate_id: id, p_opening_id: ouverture },
    'Le certificat n’a pas pu être lu.',
  )
}

// Rendez-vous pris depuis la consultation (reports suivis) :
// [{ appointment_id, starts_at, status, type_label, practitioner_name, rescheduled }].
export async function chargerSuivis(consultationId) {
  return (
    (await appeler(
      'get_encounter_followups',
      { p_encounter_id: consultationId },
      'Le prochain rendez-vous n’a pas pu être lu.',
    )) ?? []
  )
}

// champs : comme prendreRdv (rendez-vous) ; confirmer : avertissements acceptés.
export async function prendreSuivi(consultationId, champs, confirmer = false) {
  const { data, error } = await client().rpc('schedule_encounter_followup', {
    p_encounter_id: consultationId,
    p_type_id: champs.typeId,
    p_starts_at: champs.debut,
    p_practitioner_id: champs.praticienId || null,
    p_session_id: champs.seanceId || null,
    p_confirm: confirmer,
    p_outside_session: !champs.seanceId && !!champs.horsSeance,
  })
  if (error) {
    const e = erreurConsultation(error, 'Le rendez-vous n’a pas été enregistré. Réessayez.')
    e.confirmation = error.hint === 'confirmation_required'
    throw e
  }
  return data
}
