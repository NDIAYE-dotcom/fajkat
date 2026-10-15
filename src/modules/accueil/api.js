// Accès aux données de l'accueil du jour (étape 12) : file d'attente (feature file_attente).
// Le numéro de ticket (A-001), la date du jour et le jeton du QR sont attribués par la base
// (register_arrival), jamais par l'application. Le motif de venue est envoyé à
// l'enregistrement mais ne revient que pour les soignants (get_queue_board).
// Suivi public du ticket : get_ticket_public, sans connexion (numéro, personnes devant,
// salle ; jamais de nom, de motif ni de service).

import { MESSAGE_INDISPONIBLE, traduireErreur } from '../../lib/erreursAuth.js'
import { supabase } from '../../lib/supabase.js'

function client() {
  if (!supabase) throw new Error(MESSAGE_INDISPONIBLE)
  return supabase
}

export const cles = {
  permissions: (orgId) => ['accueil', 'permissions', orgId],
  services: (orgId) => ['accueil', 'services', orgId],
  priorites: () => ['accueil', 'priorites'],
  tableau: (orgId) => ['accueil', 'tableau', orgId],
  suivi: (code) => ['accueil', 'suivi', code],
}

// Refus métier des fonctions de la file (22023, ou 42501 levé par elles) : message en
// français, affiché tel quel. Un 42501 de Postgres lui-même (« permission denied… ») ne
// l'est pas.
function erreurFile(error, repli) {
  if (error?.code === '42501' && error.message && !/^permission denied/i.test(error.message)) {
    const traduite = new Error(error.message, { cause: error })
    traduite.code = error.code
    return traduite
  }
  return traduireErreur(error, repli)
}

// { read, write, medical, manage, sell_ticket } — affichage seulement : la base décide.
export async function chargerPermissions(orgId) {
  const { data, error } = await client().rpc('queue_permissions', { p_org_id: orgId })
  if (error) throw traduireErreur(error, 'Vos droits sur la file d’attente n’ont pas pu être lus.')
  return data ?? {}
}

// Services de la file en service (lettre A, B, C…), dans l'ordre choisi par la structure.
export async function chargerServices(orgId) {
  const { data, error } = await client()
    .from('queue_services')
    .select('id, label, letter, default_room_id, sort_order')
    .eq('org_id', orgId)
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('sort_order')
    .order('letter')
  if (error) throw traduireErreur(error, 'Les services de la file n’ont pas pu être chargés.')
  return data ?? []
}

export async function chargerPriorites() {
  const { data, error } = await client()
    .from('queue_priorities')
    .select('code, label, rank, sort_order')
    .eq('is_active', true)
    .order('sort_order')
  if (error) throw traduireErreur(error, 'Les priorités n’ont pas pu être chargées.')
  return data ?? []
}

// Passage créé : ligne de visits (ticket_number, public_code, arrived_at…).
export async function enregistrerArrivee(orgId, { patientId, serviceId, priorite, motif }) {
  const { data, error } = await client().rpc('register_arrival', {
    p_org_id: orgId,
    p_patient_id: patientId,
    p_queue_service_id: serviceId,
    p_priority: priorite,
    p_reason: motif?.trim() || null,
  })
  if (error) throw erreurFile(error, 'L’arrivée n’a pas été enregistrée. Réessayez.')
  return data
}

// Passages du jour (tableau de la salle d'attente). Motif et alerte des constantes : null
// pour les rôles non soignants.
export async function chargerTableau(orgId) {
  const { data, error } = await client().rpc('get_queue_board', { p_org_id: orgId })
  if (error) throw erreurFile(error, 'La file du jour n’a pas pu être chargée.')
  return data ?? []
}

// Jeton du QR d'un passage, pour réimprimer son ticket.
export async function chargerJetonTicket(visitId) {
  const { data, error } = await client()
    .from('visits')
    .select('public_code')
    .eq('id', visitId)
    .maybeSingle()
  if (error) throw traduireErreur(error, 'Le ticket n’a pas pu être préparé.')
  if (!data) throw new Error('Ce passage est introuvable.')
  return data.public_code
}

// Page publique ouverte par le QR : { status, ticket_number, ahead, room, org_name }.
// status : waiting | called | done | expired | unknown.
export async function chargerSuiviTicket(code) {
  const { data, error } = await client().rpc('get_ticket_public', { p_code: code })
  if (error) throw traduireErreur(error, 'Le suivi du ticket n’a pas pu être chargé.')
  return data ?? { status: 'unknown' }
}
