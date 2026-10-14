import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useState } from 'react'
import {
  chargerNonLues,
  chargerNotifications,
  clesNotifications,
  ecouterNotifications,
  marquerLues,
} from '../lib/notifications.js'
import { useAuth } from './useAuth.js'
import { useOrganization } from './useOrganization.js'

// Notifications de la structure active, mises à jour en temps réel (Supabase Realtime).
// derniere : la dernière notification arrivée pendant la session (animation, annonce
// pour les lecteurs d'écran) ; null au chargement.
export function useNotifications() {
  const { utilisateur } = useAuth()
  const { structure } = useOrganization()
  const queryClient = useQueryClient()
  const orgId = structure?.id
  const userId = utilisateur?.id
  const actif = Boolean(orgId && userId)
  const [derniere, setDerniere] = useState(null)

  const liste = useQuery({
    queryKey: clesNotifications.liste(orgId, userId),
    queryFn: () => chargerNotifications(orgId),
    enabled: actif,
  })
  const nonLues = useQuery({
    queryKey: clesNotifications.nonLues(orgId, userId),
    queryFn: () => chargerNonLues(orgId),
    enabled: actif,
  })

  const recharger = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: clesNotifications.toutes(orgId, userId) })
  }, [queryClient, orgId, userId])

  useEffect(() => {
    if (!actif) return undefined
    const desabonner = ecouterNotifications(userId, {
      surChangement: ({ type, notification }) => {
        // Le filtre Realtime porte sur le destinataire : on ignore les autres structures.
        if (notification?.org_id !== orgId) return
        if (type === 'INSERT') setDerniere(notification)
        recharger()
      },
      surConnexion: recharger,
    })
    // Retour du réseau après une coupure : on rattrape sans attendre Realtime.
    window.addEventListener('online', recharger)
    return () => {
      desabonner()
      window.removeEventListener('online', recharger)
    }
  }, [actif, userId, orgId, recharger])

  // Changement de structure : l'annonce précédente ne la concerne plus.
  const [orgPrecedente, setOrgPrecedente] = useState(orgId)
  if (orgPrecedente !== orgId) {
    setOrgPrecedente(orgId)
    setDerniere(null)
  }

  // Mise à jour immédiate de l'affichage, avant la réponse du serveur.
  const marquer = useCallback(
    async (ids) => {
      const maintenant = new Date().toISOString()
      queryClient.setQueryData(clesNotifications.liste(orgId, userId), (anciennes) =>
        anciennes?.map((n) =>
          !n.read_at && (!ids || ids.includes(n.id)) ? { ...n, read_at: maintenant } : n,
        ),
      )
      try {
        await marquerLues(orgId, ids)
      } finally {
        recharger()
      }
    },
    [queryClient, orgId, userId, recharger],
  )

  return {
    notifications: liste.data ?? [],
    chargement: liste.isPending && actif,
    erreur: liste.error,
    nombreNonLues: nonLues.data?.nombre ?? 0,
    urgent: nonLues.data?.urgent ?? false,
    derniere,
    recharger,
    marquerLue: (id) => marquer([id]),
    toutMarquerLu: () => marquer(null),
  }
}
