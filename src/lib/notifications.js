// Accès aux notifications de l'utilisateur connecté (cloche de l'en-tête).
// Les notifications sont créées par la base (fonction notify, depuis des triggers ou des
// RPC) ; le front ne fait que les lire et les marquer comme lues. La RLS limite chacun
// aux siennes ; Realtime applique la même règle aux événements.

import { MESSAGE_INDISPONIBLE, traduireErreur } from './erreursAuth.js'
import { supabase } from './supabase.js'

function client() {
  if (!supabase) throw new Error(MESSAGE_INDISPONIBLE)
  return supabase
}

export const NOMBRE_AFFICHE = 30

export const clesNotifications = {
  toutes: (orgId, userId) => ['notifications', orgId, userId],
  liste: (orgId, userId) => ['notifications', orgId, userId, 'liste'],
  nonLues: (orgId, userId) => ['notifications', orgId, userId, 'non-lues'],
}

// Dernières notifications de la structure active, les plus récentes d'abord.
export async function chargerNotifications(orgId) {
  const { data, error } = await client()
    .from('notifications')
    .select('id, type, severity, title, body, link, read_at, created_at')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(NOMBRE_AFFICHE)
  if (error) throw traduireErreur(error, 'Les notifications n’ont pas pu être chargées.')
  return data ?? []
}

// Non lues, toutes (pas seulement les 30 affichées) : { nombre, urgent }.
// Au-delà de 99, la pastille affiche « 9+ » de toute façon.
export async function chargerNonLues(orgId) {
  const { data, error } = await client()
    .from('notifications')
    .select('id, severity')
    .eq('org_id', orgId)
    .is('read_at', null)
    .limit(100)
  if (error) throw traduireErreur(error, 'Les notifications n’ont pas pu être chargées.')
  return {
    nombre: data.length,
    urgent: data.some((n) => n.severity === 'urgent'),
  }
}

// ids absent : toutes les non lues de la structure. Heure de lecture fixée par le serveur.
export async function marquerLues(orgId, ids = null) {
  const { error } = await client().rpc('mark_notifications_read', {
    p_org_id: orgId,
    p_ids: ids,
  })
  if (error) throw traduireErreur(error, 'Les notifications n’ont pas pu être marquées comme lues.')
}

// Écoute les nouvelles notifications et les lectures (y compris celles faites ailleurs :
// autre appareil, demande traitée par un collègue). Renvoie la fonction de désabonnement.
// surChangement({ type: 'INSERT' | 'UPDATE', notification }) ; surConnexion() après
// chaque (re)connexion du canal, pour rattraper ce qui a pu être manqué.
export function ecouterNotifications(userId, { surChangement, surConnexion }) {
  if (!supabase) return () => {}
  const canal = supabase
    // Suffixe unique : deux abonnements (double montage en développement) ne se gênent pas.
    .channel(`notifications:${userId}:${Math.random().toString(36).slice(2)}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'notifications',
        filter: `recipient_user_id=eq.${userId}`,
      },
      (charge) => surChangement({ type: charge.eventType, notification: charge.new }),
    )
    .subscribe((statut) => {
      if (statut === 'SUBSCRIBED') surConnexion()
    })
  return () => {
    supabase.removeChannel(canal)
  }
}
