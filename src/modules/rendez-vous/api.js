// Accès aux données des rendez-vous (étape 13, feature rendez_vous ; praticiens si
// feature agenda_multi_praticiens). Partie B : paramètres de l'agenda (types et durées,
// séances et capacités, pauses, jours fériés) et report des rendez-vous d'un jour férié.
// Partie C : agenda d'une période (list_appointments). Partie D : prise, report et
// changement de type d'un rendez-vous, prochaines séances qui ont des places.
// Les contrôles (séance pleine, jour férié à confirmer…) sont faits par la base : un
// avertissement à confirmer revient avec le hint « confirmation_required ».

import { MESSAGE_INDISPONIBLE, traduireErreur } from '../../lib/erreursAuth.js'
import { supabase } from '../../lib/supabase.js'

function client() {
  if (!supabase) throw new Error(MESSAGE_INDISPONIBLE)
  return supabase
}

export const cles = {
  permissions: (orgId) => ['rendez-vous', 'permissions', orgId],
  types: (orgId) => ['rendez-vous', 'types', orgId],
  seances: (orgId) => ['rendez-vous', 'seances', orgId],
  pauses: (orgId) => ['rendez-vous', 'pauses', orgId],
  feries: (orgId, annee) => ['rendez-vous', 'feries', orgId, annee],
  toutesFeries: (orgId) => ['rendez-vous', 'feries', orgId],
  modelesFeries: (pays) => ['rendez-vous', 'modeles-feries', pays],
  servicesFile: (orgId) => ['rendez-vous', 'services-file', orgId],
  praticiens: (orgId) => ['rendez-vous', 'praticiens', orgId],
  rdvDuJour: (orgId, date) => ['rendez-vous', 'jour', orgId, date],
  agenda: (orgId, du, au) => ['rendez-vous', 'agenda', orgId, du, au],
  feriesPeriode: (orgId, du, au) => ['rendez-vous', 'feries', orgId, 'periode', du, au],
}

const MESSAGE_DROITS =
  'Seuls le propriétaire et les administrateurs modifient les paramètres de l’agenda.'

// Refus métier (22023, ou 42501 levé par nos fonctions) : message en français tel quel.
// confirmation : avertissement à confirmer (jour férié, séance hors horaires…).
function erreurRdv(error, repli) {
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
  traduite.confirmation = error?.hint === 'confirmation_required'
  return traduite
}

// Erreurs d'écriture des paramètres : contraintes traduites, droits expliqués.
function erreurParametre(error, repli, messages = {}) {
  if (error?.code === '23505') return new Error(messages.doublon ?? 'Cet élément existe déjà.')
  if (error?.code === '23514') return new Error(messages.contrainte ?? repli)
  if (error?.code === '42501') return new Error(messages.droits ?? MESSAGE_DROITS)
  return traduireErreur(error, repli)
}

async function modifier(table, id, champs, repli, messages) {
  const { data, error } = await client().from(table).update(champs).eq('id', id).select('id')
  if (error) throw erreurParametre(error, repli, messages)
  if (!data?.length) throw new Error(MESSAGE_DROITS)
}

// { read, write, medical, manage, multi_practitioner, queue } — affichage seulement.
export async function chargerPermissions(orgId) {
  const { data, error } = await client().rpc('appointment_permissions', { p_org_id: orgId })
  if (error) throw traduireErreur(error, 'Vos droits sur l’agenda n’ont pas pu être lus.')
  return data ?? {}
}

// --- Types de rendez-vous ------------------------------------------------------

export async function chargerTypes(orgId) {
  const { data, error } = await client()
    .from('appointment_types')
    .select(
      'id, template_code, label, duration_minutes, is_discreet, recurrence_months, ' +
        'queue_service_id, is_active, sort_order',
    )
    .eq('org_id', orgId)
    .is('deleted_at', null)
    .order('sort_order')
    .order('label')
  if (error) throw traduireErreur(error, 'Les types de rendez-vous n’ont pas pu être chargés.')
  return data ?? []
}

const MESSAGES_TYPE = {
  doublon: 'Un type de rendez-vous porte déjà ce nom.',
  contrainte: 'Libellé de 2 à 60 caractères, durée de 5 à 480 minutes, récurrence de 1 à 24 mois.',
}

export async function ajouterType(orgId, champs) {
  const { data, error } = await client()
    .from('appointment_types')
    .insert({ ...champs, org_id: orgId })
    .select('id, is_discreet')
  if (error) throw erreurParametre(error, 'Le type n’a pas été ajouté. Réessayez.', MESSAGES_TYPE)
  return data?.[0] ?? null
}

// champs : label, duration_minutes, is_discreet, recurrence_months, queue_service_id,
// is_active, sort_order. Jamais de suppression : les rendez-vous pris gardent leur type.
export async function modifierType(id, champs) {
  await modifier(
    'appointment_types',
    id,
    champs,
    'Le type n’a pas été modifié. Réessayez.',
    MESSAGES_TYPE,
  )
}

// Services de la file d'attente (étape 12), pour le bouton « Arrivé ». Vide si la
// structure n'a pas la file d'attente.
export async function chargerServicesFile(orgId) {
  const { data, error } = await client()
    .from('queue_services')
    .select('id, label, letter')
    .eq('org_id', orgId)
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('sort_order')
    .order('letter')
  if (error) throw traduireErreur(error, 'Les services de la file n’ont pas pu être chargés.')
  return data ?? []
}

// --- Séances ---------------------------------------------------------------------

export async function chargerSeances(orgId) {
  const { data, error } = await client()
    .from('appointment_sessions')
    .select(
      'id, appointment_type_id, weekday, start_time, end_time, capacity, ' +
        'practitioner_membership_id, label, is_active, sort_order',
    )
    .eq('org_id', orgId)
    .is('deleted_at', null)
    .order('weekday')
    .order('start_time')
  if (error) throw traduireErreur(error, 'Les séances n’ont pas pu être chargées.')
  return data ?? []
}

const MESSAGES_SEANCE = {
  contrainte: 'L’heure de fin doit suivre l’heure de début ; capacité de 1 à 1 000.',
  droits:
    'Séance refusée : seuls le propriétaire et les administrateurs les gèrent, avec un praticien actif et soignant.',
}

export async function ajouterSeance(orgId, champs) {
  const { error } = await client()
    .from('appointment_sessions')
    .insert({ ...champs, org_id: orgId })
  if (error)
    throw erreurParametre(error, 'La séance n’a pas été ajoutée. Réessayez.', MESSAGES_SEANCE)
}

export async function modifierSeance(id, champs) {
  await modifier(
    'appointment_sessions',
    id,
    champs,
    'La séance n’a pas été modifiée. Réessayez.',
    MESSAGES_SEANCE,
  )
}

// Rendez-vous à venir d'une séance (prévus ou confirmés, à partir d'aujourd'hui), pour
// prévenir avant de la retirer. La base refuse elle-même de changer le type, le jour, les
// horaires ou la capacité d'une séance qui en a (appointment_sessions_guard).
export async function compterRdvAVenirSeance(seanceId, aujourdhui) {
  const { count, error } = await client()
    .from('appointments')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', seanceId)
    .in('status', ['scheduled', 'confirmed'])
    .gte('local_date', aujourdhui)
    .is('deleted_at', null)
  if (error) throw traduireErreur(error, 'Les rendez-vous de la séance n’ont pas pu être comptés.')
  return count ?? 0
}

// Membres actifs, pour choisir le praticien d'une séance (offre Clinique).
export async function chargerMembres(orgId) {
  const { data, error } = await client()
    .from('memberships')
    .select(
      'id, role, is_active, is_clinician, profil:profiles!memberships_user_id_fkey (full_name)',
    )
    .eq('org_id', orgId)
    .eq('is_active', true)
    .is('deleted_at', null)
  if (error) throw traduireErreur(error, 'La liste des praticiens n’a pas pu être chargée.')
  return (data ?? []).map((m) => ({
    ...m,
    nom: m.profil?.full_name?.trim() || 'Membre sans nom',
  }))
}

// --- Pauses ---------------------------------------------------------------------

export async function chargerPauses(orgId) {
  const { data, error } = await client()
    .from('appointment_breaks')
    .select('id, weekday, start_time, end_time, label, is_active')
    .eq('org_id', orgId)
    .is('deleted_at', null)
    .order('start_time')
  if (error) throw traduireErreur(error, 'Les pauses n’ont pas pu être chargées.')
  return data ?? []
}

const MESSAGES_PAUSE = {
  contrainte: 'L’heure de fin doit suivre l’heure de début ; libellé de 2 à 60 caractères.',
}

export async function ajouterPause(orgId, champs) {
  const { error } = await client()
    .from('appointment_breaks')
    .insert({ ...champs, org_id: orgId })
  if (error)
    throw erreurParametre(error, 'La pause n’a pas été ajoutée. Réessayez.', MESSAGES_PAUSE)
}

export async function modifierPause(id, champs) {
  await modifier(
    'appointment_breaks',
    id,
    champs,
    'La pause n’a pas été modifiée. Réessayez.',
    MESSAGES_PAUSE,
  )
}

// --- Jours fériés -----------------------------------------------------------------

export async function chargerJoursFeries(orgId, annee) {
  const { data, error } = await client()
    .from('holidays')
    .select('id, holiday_date, label, template_code')
    .eq('org_id', orgId)
    .is('deleted_at', null)
    .gte('holiday_date', `${annee}-01-01`)
    .lte('holiday_date', `${annee}-12-31`)
    .order('holiday_date')
  if (error) throw traduireErreur(error, 'Les jours fériés n’ont pas pu être chargés.')
  return data ?? []
}

// Liste indicative du pays : fêtes fixes (mois et jour) et fêtes à date variable (sans date).
export async function chargerModelesFeries(pays) {
  const { data, error } = await client()
    .from('holiday_templates')
    .select('code, label, fixed_month, fixed_day, sort_order')
    .eq('country_code', pays)
    .eq('is_active', true)
    .order('sort_order')
  if (error) throw traduireErreur(error, 'La liste des fêtes n’a pas pu être chargée.')
  return data ?? []
}

const MESSAGES_FERIE = {
  doublon: 'Un jour férié est déjà enregistré à cette date.',
  contrainte: 'Donnez un libellé de 2 à 80 caractères.',
}

export async function ajouterJourFerie(orgId, champs) {
  const { error } = await client()
    .from('holidays')
    .insert({ ...champs, org_id: orgId })
  if (error)
    throw erreurParametre(error, 'Le jour férié n’a pas été ajouté. Réessayez.', MESSAGES_FERIE)
}

// champs : holiday_date, label. Retrait : deleted_at (jamais de suppression).
export async function modifierJourFerie(id, champs) {
  await modifier(
    'holidays',
    id,
    champs,
    'Le jour férié n’a pas été modifié. Réessayez.',
    MESSAGES_FERIE,
  )
}

export async function retirerJourFerie(id) {
  await modifier(
    'holidays',
    id,
    { deleted_at: new Date().toISOString() },
    'Le jour férié n’a pas été retiré. Réessayez.',
    MESSAGES_FERIE,
  )
}

// Fêtes fixes d'une année (1er janvier, 4 avril…), d'après le pays. Renvoie le nombre ajouté.
export async function ajouterFetesFixes(orgId, annee) {
  const { data, error } = await client().rpc('add_fixed_holidays', {
    p_org_id: orgId,
    p_year: annee,
  })
  if (error) throw erreurRdv(error, 'Les fêtes fixes n’ont pas été ajoutées. Réessayez.')
  return data ?? 0
}

// --- Rendez-vous d'un jour (report d'un jour férié) ---------------------------------

const STATUTS_A_REPORTER = ['scheduled', 'confirmed']

// Rendez-vous encore à venir ce jour-là (prévus ou confirmés), dans l'ordre de l'heure.
export async function chargerRdvAReporter(orgId, date) {
  const { data, error } = await client().rpc('list_appointments', {
    p_org_id: orgId,
    p_from: date,
    p_to: date,
  })
  if (error) throw erreurRdv(error, 'Les rendez-vous de ce jour n’ont pas pu être chargés.')
  return (data ?? []).filter((r) => STATUTS_A_REPORTER.includes(r.status))
}

// Report groupé vers un autre jour, à la même heure. Tout ou rien. confirmer : accepte
// les avertissements (autre jour férié, pause…) ; une séance pleine reste refusée.
export async function reporterRdv(ids, nouvelleDate, confirmer = false) {
  const { data, error } = await client().rpc('reschedule_appointments', {
    p_appointment_ids: ids,
    p_new_date: nouvelleDate,
    p_confirm: confirmer,
  })
  if (error) throw erreurRdv(error, 'Les rendez-vous n’ont pas été reportés. Réessayez.')
  return data ?? []
}

// --- Agenda -----------------------------------------------------------------------

// Rendez-vous d'une période (62 jours au plus), tous statuts. La note ne revient qu'aux
// soignants.
export async function chargerAgenda(orgId, du, au) {
  const { data, error } = await client().rpc('list_appointments', {
    p_org_id: orgId,
    p_from: du,
    p_to: au,
  })
  if (error) throw erreurRdv(error, 'L’agenda n’a pas pu être chargé. Réessayez.')
  return data ?? []
}

export async function chargerFeriesPeriode(orgId, du, au) {
  const { data, error } = await client()
    .from('holidays')
    .select('id, holiday_date, label')
    .eq('org_id', orgId)
    .is('deleted_at', null)
    .gte('holiday_date', du)
    .lte('holiday_date', au)
  if (error) throw traduireErreur(error, 'Les jours fériés n’ont pas pu être chargés.')
  return data ?? []
}

// --- Prise et modification d'un rendez-vous (partie D) -----------------------------
// Un type discret n'est pris que par les soignants, l'owner et l'admin : la base refuse
// les autres. Report : la base garde le vrai type du rendez-vous, jamais le libellé neutre
// affiché à l'accueil ; le type ne change que par changerTypeRdv (soignants).

// Contrôle avant l'envoi : { session_id, blocking: [{ code, message }], warnings: [...] }.
// rdvId : rendez-vous reporté (sa place n'est pas comptée ; son vrai type est contrôlé).
export async function verifierRdv(orgId, champs) {
  const { data, error } = await client().rpc('check_appointment', {
    p_org_id: orgId,
    p_patient_id: champs.patientId,
    p_type_id: champs.typeId,
    p_starts_at: champs.debut,
    p_practitioner_id: champs.praticienId || null,
    p_session_id: champs.seanceId || null,
    p_exclude_id: champs.rdvId ?? null,
    p_outside_session: !champs.seanceId && !!champs.horsSeance,
  })
  if (error) throw erreurRdv(error, 'Le rendez-vous n’a pas pu être vérifié. Réessayez.')
  return data?.[0] ?? { blocking: [], warnings: [] }
}

export async function prendreRdv(orgId, champs, confirmer = false) {
  const { data, error } = await client().rpc('book_appointment', {
    p_org_id: orgId,
    p_patient_id: champs.patientId,
    p_type_id: champs.typeId,
    p_starts_at: champs.debut,
    p_practitioner_id: champs.praticienId || null,
    p_session_id: champs.seanceId || null,
    p_note: champs.note?.trim() || null,
    p_confirm: confirmer,
    p_outside_session: !champs.seanceId && !!champs.horsSeance,
  })
  if (error) throw erreurRdv(error, 'Le rendez-vous n’a pas été enregistré. Réessayez.')
  return data?.[0] ?? null
}

// Report (nouvelle date, heure, praticien) : l'ancien rendez-vous reste, au statut
// « Reporté ». Un rendez-vous discret masqué retrouve sa séance par la base.
export async function reporterUnRdv(rdvId, champs, confirmer = false) {
  const { data, error } = await client().rpc('reschedule_appointment', {
    p_appointment_id: rdvId,
    p_starts_at: champs.debut,
    p_practitioner_id: champs.praticienId || null,
    p_keep_practitioner: champs.garderPraticien ?? true,
    p_session_id: champs.seanceId || null,
    p_confirm: confirmer,
  })
  if (error) throw erreurRdv(error, 'Le rendez-vous n’a pas été reporté. Réessayez.')
  return data
}

export async function changerTypeRdv(rdvId, typeId, confirmer = false) {
  const { data, error } = await client().rpc('set_appointment_type', {
    p_appointment_id: rdvId,
    p_type_id: typeId,
    p_confirm: confirmer,
  })
  if (error) throw erreurRdv(error, 'Le type n’a pas été changé. Réessayez.')
  return data
}

// Prochaines séances qui ont des places, pour un type (prise) ou un rendez-vous (report).
// Rendez-vous discret masqué : date, heure et places seulement.
export async function chargerProchainesSeances(orgId, { typeId, rdvId, du, praticienId }) {
  const { data, error } = await client().rpc('next_available_sessions', {
    p_org_id: orgId,
    p_type_id: rdvId ? null : typeId,
    p_appointment_id: rdvId ?? null,
    p_from: du,
    p_practitioner_id: praticienId || null,
    p_limit: 3,
  })
  if (error) throw erreurRdv(error, 'Les prochaines séances n’ont pas pu être cherchées.')
  return data ?? []
}
