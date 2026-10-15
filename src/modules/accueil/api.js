// Accès aux données de l'accueil du jour (étape 12) : file d'attente (feature file_attente).
// Le numéro de ticket (A-001), la date du jour et le jeton du QR sont attribués par la base
// (register_arrival), jamais par l'application. Le motif de venue est envoyé à
// l'enregistrement mais ne revient que pour les soignants (get_queue_board).
// Tickets de consultation (postes de santé, feature tickets_consultation) :
// sell_consultation_ticket vend le ticket ET enregistre l'arrivée ; la recette attend
// son rattachement à la caisse. Gratuité : motif choisi dans exemption_reasons, liste
// propre à la structure (owner et admin). Bilan : gratuits comptés à part, par motif.
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
  prestations: (orgId) => ['accueil', 'prestations', orgId],
  motifsGratuite: (orgId) => ['accueil', 'motifs-gratuite', orgId],
  tickets: (orgId) => ['accueil', 'tickets', orgId],
  bilan: (orgId) => ['accueil', 'bilan', orgId],
  salles: (orgId) => ['accueil', 'salles', orgId],
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
    .select('id, template_code, label, letter, default_room_id, sort_order')
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

// --- Tickets de consultation -------------------------------------------------

// Prestations vendues au ticket : services « consultation » de la structure, avec leur
// tarif (null tant qu'il n'est pas saisi dans Paramètres).
export async function chargerPrestations(orgId) {
  const { data, error } = await client()
    .from('services')
    .select('id, label, price, sort_order')
    .eq('org_id', orgId)
    .eq('category', 'consultation')
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('sort_order')
    .order('label')
  if (error) throw traduireErreur(error, 'Les prestations n’ont pas pu être chargées.')
  return data ?? []
}

// Motifs de gratuité de la structure. tous : retirés compris (gestion de la liste).
export async function chargerMotifsGratuite(orgId, { tous = false } = {}) {
  let requete = client()
    .from('exemption_reasons')
    .select('id, label, is_active, sort_order')
    .eq('org_id', orgId)
    .is('deleted_at', null)
  if (!tous) requete = requete.eq('is_active', true)
  const { data, error } = await requete.order('sort_order').order('label')
  if (error) throw traduireErreur(error, 'Les motifs de gratuité n’ont pas pu être chargés.')
  return data ?? []
}

function erreurMotif(error, repli) {
  if (error?.code === '23505') return new Error('Ce motif existe déjà dans la liste.')
  if (error?.code === '23514') return new Error('Le motif doit compter de 2 à 60 caractères.')
  if (error?.code === '42501') {
    return new Error('Seuls le propriétaire et les administrateurs modifient cette liste.')
  }
  return traduireErreur(error, repli)
}

export async function ajouterMotifGratuite(orgId, libelle, ordre) {
  const { error } = await client()
    .from('exemption_reasons')
    .insert({ org_id: orgId, label: libelle.trim(), sort_order: ordre })
  if (error) throw erreurMotif(error, 'Le motif n’a pas été ajouté. Réessayez.')
}

// champs : { label } ou { is_active }. Jamais de suppression : un motif retiré reste dans
// les tickets déjà vendus et dans les bilans.
export async function modifierMotifGratuite(id, champs) {
  const { data, error } = await client()
    .from('exemption_reasons')
    .update(champs)
    .eq('id', id)
    .select('id')
  if (error) throw erreurMotif(error, 'Le motif n’a pas été modifié. Réessayez.')
  if (!data?.length) {
    throw new Error('Seuls le propriétaire et les administrateurs modifient cette liste.')
  }
}

// Vente + arrivée. paiement : 'cash' | 'wave' | 'orange_money' | 'free_money' | 'gratuit'.
// Réponse : { visit_id, ticket_number, public_code, arrived_at, amount, service_label,
// exemption_reason, receipt_number, payment_method, payment_reference, received_at }.
export async function vendreTicket(orgId, saisie) {
  const gratuit = saisie.paiement === 'gratuit'
  const { data, error } = await client().rpc('sell_consultation_ticket', {
    p_org_id: orgId,
    p_patient_id: saisie.patient.id,
    p_service_id: saisie.prestationId,
    p_queue_service_id: saisie.serviceId,
    p_priority: saisie.priorite,
    p_reason: saisie.motif?.trim() || null,
    p_payment_method: gratuit ? null : saisie.paiement,
    p_payment_reference: gratuit ? null : saisie.reference?.trim() || null,
    p_exemption_reason_id: gratuit ? saisie.motifGratuiteId : null,
  })
  if (error) throw erreurFile(error, 'Le ticket n’a pas été vendu. Réessayez.')
  return data
}

// Tickets vendus aujourd'hui (jour de la structure), reçu compris.
export async function chargerTicketsDuJour(orgId) {
  const { data, error } = await client().rpc('list_consultation_tickets', { p_org_id: orgId })
  if (error) throw erreurFile(error, 'Les tickets du jour n’ont pas pu être chargés.')
  return data ?? []
}

// { paid_count, paid_amount, free_count, by_method: [...], free_by_reason: [...] }
export async function chargerBilanTickets(orgId) {
  const { data, error } = await client().rpc('consultation_tickets_summary', { p_org_id: orgId })
  if (error) throw erreurFile(error, 'Le bilan des tickets n’a pas pu être chargé.')
  return data
}

// --- Tableau de la salle d'attente -----------------------------------------------

export async function chargerSalles(orgId) {
  const { data, error } = await client()
    .from('rooms')
    .select('id, label, sort_order')
    .eq('org_id', orgId)
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('sort_order')
    .order('label')
  if (error) throw traduireErreur(error, 'Les salles n’ont pas pu être chargées.')
  return data ?? []
}

// Déplacement sur le tableau (bouton ou glisser-déposer), sans appel à l'écran.
// statut : waiting | vitals | consultation | done | left.
export async function deplacerPassage(visitId, statut, salleId = null) {
  const { data, error } = await client().rpc('move_visit', {
    p_visit_id: visitId,
    p_status: statut,
    p_room_id: salleId,
  })
  if (error) throw erreurFile(error, 'Le patient n’a pas été déplacé. Réessayez.')
  return data
}

// Appel d'un patient précis vers les constantes ou la consultation (ou rappel) : son
// numéro s'affiche sur l'écran de la salle d'attente.
export async function appelerPassage(visitId, cible, salleId = null) {
  const { data, error } = await client().rpc('call_visit', {
    p_visit_id: visitId,
    p_target: cible,
    p_room_id: salleId,
  })
  if (error) throw erreurFile(error, 'L’appel n’a pas abouti. Réessayez.')
  return data
}

// « Appeler le suivant » : priorité, puis heure d'arrivée. null si personne n'attend.
export async function appelerSuivant(orgId, cible, salleId = null, serviceIds = null) {
  const { data, error } = await client().rpc('call_next', {
    p_org_id: orgId,
    p_target: cible,
    p_room_id: salleId,
    p_queue_service_ids: serviceIds?.length ? serviceIds : null,
  })
  if (error) throw erreurFile(error, 'L’appel n’a pas abouti. Réessayez.')
  return data?.id ? data : null
}

// Changements de la file (arrivée, déplacement, appel) faits sur n'importe quel appareil
// de la structure. La table visits ne porte ni motif ni constantes. surConnexion : après
// chaque (re)connexion du canal, pour rattraper ce qui a pu être manqué.
export function ecouterFile(orgId, { surChangement, surConnexion }) {
  if (!supabase) return () => {}
  const canal = supabase
    .channel(`file:${orgId}:${Math.random().toString(36).slice(2)}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'visits', filter: `org_id=eq.${orgId}` },
      surChangement,
    )
    .subscribe((statut) => {
      if (statut === 'SUBSCRIBED') surConnexion()
    })
  return () => {
    supabase.removeChannel(canal)
  }
}
