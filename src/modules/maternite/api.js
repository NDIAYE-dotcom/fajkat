// Accès aux données de la maternité (étape 15, feature maternite). Partie A : suivi de
// grossesse (ouverture, datations, gestité / parité, groupe sanguin, retrait) et réglages
// de la structure. Le suivi ne se lit que par des fonctions de la base : elle refuse
// l'accueil, le caissier, le comptable et l'owner qui n'exerce pas.

import { estErreurReseau, MESSAGE_INDISPONIBLE, traduireErreur } from '../../lib/erreursAuth.js'
import { supabase } from '../../lib/supabase.js'

function client() {
  if (!supabase) throw new Error(MESSAGE_INDISPONIBLE)
  return supabase
}

export const cles = {
  permissions: (orgId) => ['maternite', 'permissions', orgId],
  reglages: (orgId) => ['maternite', 'reglages', orgId],
  grossesse: (id) => ['maternite', 'grossesse', id],
  grossessesPatiente: (patientId) => ['maternite', 'grossesses-patiente', patientId],
  enCours: (orgId, texte, page) => ['maternite', 'en-cours', orgId, texte, page],
  toutesEnCours: (orgId) => ['maternite', 'en-cours', orgId],
}

// Refus métier (22023, 42501 levés par nos fonctions) : message de la base, en français.
function erreurMaternite(error, repli) {
  let traduite
  if (
    ['22023', '42501'].includes(error?.code) &&
    error.message &&
    !/permission denied|row-level/i.test(error.message)
  ) {
    traduite = new Error(error.message, { cause: error })
    traduite.code = error.code
  } else {
    traduite = traduireErreur(error, repli)
  }
  traduite.reseau = estErreurReseau(error)
  return traduite
}

async function appeler(fonction, parametres, repli) {
  const { data, error } = await client().rpc(fonction, parametres)
  if (error) throw erreurMaternite(error, repli)
  return data
}

// { read, write, configure } — affichage seulement.
export async function chargerPermissions(orgId) {
  return (
    (await appeler(
      'maternity_permissions',
      { p_org_id: orgId },
      'Vos droits sur la maternité n’ont pas pu être lus.',
    )) ?? {}
  )
}

// --- Réglages ---------------------------------------------------------------------------

const COLONNES_REGLAGES = 'id, edd_method, pregnancy_length_days, max_gestational_days'

export async function chargerReglages(orgId) {
  const { data, error } = await client()
    .from('maternity_settings')
    .select(COLONNES_REGLAGES)
    .eq('org_id', orgId)
    .maybeSingle()
  if (error) throw traduireErreur(error, 'Les réglages de la maternité n’ont pas pu être lus.')
  return data
}

export async function enregistrerReglages(orgId, r) {
  const { data, error } = await client()
    .from('maternity_settings')
    .update({
      edd_method: r.edd_method,
      pregnancy_length_days: r.pregnancy_length_days,
      max_gestational_days: r.max_gestational_days,
    })
    .eq('org_id', orgId)
    .select(COLONNES_REGLAGES)
  if (error) {
    if (error.code === '23514')
      throw new Error('Vérifiez les cases : une valeur n’est pas acceptée.')
    throw traduireErreur(error, 'Les réglages n’ont pas pu être enregistrés.')
  }
  if (!data?.length) throw new Error('Votre rôle ne permet pas cette modification.')
  return data[0]
}

// --- Grossesse --------------------------------------------------------------------------

const parametresDatation = (d) => ({
  p_kind: d.kind,
  p_lmp_date: d.lmp,
  p_exam_date: d.exam,
  p_ga_days: d.gaDays,
  p_edd: d.edd,
})

// datation : { kind, lmp, exam, gaDays, edd } ; obstetrique : { gravidity, parity, living }.
export function ouvrirGrossesse(patientId, datation, obstetrique, note) {
  return appeler(
    'open_pregnancy',
    {
      p_patient_id: patientId,
      ...parametresDatation(datation),
      p_gravidity: obstetrique.gravidity,
      p_parity: obstetrique.parity,
      p_living_children: obstetrique.living,
      p_note: note || null,
    },
    'Le suivi de grossesse n’a pas pu être ouvert.',
  )
}

export function ajouterDatation(grossesseId, datation, note) {
  return appeler(
    'add_pregnancy_dating',
    { p_pregnancy_id: grossesseId, ...parametresDatation(datation), p_note: note || null },
    'La datation n’a pas pu être enregistrée.',
  )
}

export function retenirDatation(grossesseId, datationId) {
  return appeler(
    'retain_pregnancy_dating',
    { p_pregnancy_id: grossesseId, p_dating_id: datationId },
    'La datation n’a pas pu être retenue.',
  )
}

export function corrigerObstetrique(grossesseId, o) {
  return appeler(
    'update_pregnancy_obstetric',
    {
      p_pregnancy_id: grossesseId,
      p_gravidity: o.gravidity,
      p_parity: o.parity,
      p_living_children: o.living,
    },
    'La gestité et la parité n’ont pas pu être enregistrées.',
  )
}

export function enregistrerGroupeSanguin(patientId, groupe) {
  return appeler(
    'set_patient_blood_group',
    { p_patient_id: patientId, p_blood_group: groupe || null },
    'Le groupe sanguin n’a pas pu être enregistré.',
  )
}

export function retirerGrossesse(grossesseId, motif) {
  return appeler(
    'remove_pregnancy',
    { p_pregnancy_id: grossesseId, p_reason: motif },
    'La grossesse n’a pas pu être retirée.',
  )
}

export function chargerGrossesse(id) {
  return appeler(
    'get_pregnancy',
    { p_pregnancy_id: id },
    'Le suivi de grossesse n’a pas pu être lu.',
  )
}

export async function listerGrossessesPatiente(patientId) {
  return (
    (await appeler(
      'list_patient_pregnancies',
      { p_patient_id: patientId },
      'Les grossesses de la patiente n’ont pas pu être lues.',
    )) ?? []
  )
}

export const PAGE_EN_COURS = 25

export async function listerGrossessesEnCours(orgId, texte, page) {
  const lignes =
    (await appeler(
      'list_ongoing_pregnancies',
      {
        p_org_id: orgId,
        p_query: texte || null,
        p_limit: PAGE_EN_COURS,
        p_offset: (page - 1) * PAGE_EN_COURS,
      },
      'Les grossesses en cours n’ont pas pu être lues.',
    )) ?? []
  return { lignes, total: Number(lignes[0]?.total_count ?? 0) }
}
