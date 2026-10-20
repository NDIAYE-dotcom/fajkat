// Accès aux données des consultations (étape 14, feature consultations). Partie B : écran
// de consultation — démarrer, enregistrer le brouillon, reprendre, valider, avenants ;
// diagnostics (recherche, favoris), examens rapides, types de consultation. Partie C :
// antécédents, chronologie du dossier.
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
