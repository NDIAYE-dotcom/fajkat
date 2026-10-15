import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useToast } from '../../../hooks/useToast.js'
import { chargerSalles, cles, deplacerPassage, ecouterFile } from '../api.js'

// Rafraîchissement regroupé : plusieurs changements rapprochés (appel du suivant, arrivée
// sur un autre poste) ne déclenchent qu'une relecture.
const DELAI_RELECTURE_MS = 400

// Le tableau se met à jour seul quand la file change sur un autre appareil.
export function useFileTempsReel(orgId) {
  const queryClient = useQueryClient()
  useEffect(() => {
    if (!orgId) return undefined
    let minuteur = null
    const relire = () => {
      clearTimeout(minuteur)
      minuteur = setTimeout(
        () => queryClient.invalidateQueries({ queryKey: cles.tableau(orgId) }),
        DELAI_RELECTURE_MS,
      )
    }
    const desabonner = ecouterFile(orgId, { surChangement: relire, surConnexion: relire })
    return () => {
      clearTimeout(minuteur)
      desabonner()
    }
  }, [orgId, queryClient])
}

// Heure courante, renouvelée régulièrement : les temps d'attente avancent seuls.
export function useMaintenant(intervalleMs = 30 * 1000) {
  const [maintenant, setMaintenant] = useState(() => Date.now())
  useEffect(() => {
    const minuteur = setInterval(() => setMaintenant(Date.now()), intervalleMs)
    return () => clearInterval(minuteur)
  }, [intervalleMs])
  return maintenant
}

export function useSalles(orgId) {
  return useQuery({
    queryKey: cles.salles(orgId),
    queryFn: () => chargerSalles(orgId),
    enabled: Boolean(orgId),
    staleTime: 10 * 60 * 1000,
  })
}

// Déplacement d'une carte : affiché tout de suite, annulé (avec un message) si la base
// refuse ou si le réseau coupe pendant l'envoi.
export function useDeplacement(orgId) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const cle = cles.tableau(orgId)
  return useMutation({
    // Toujours envoyé : sans cela, React Query met la mutation en pause hors ligne, sans
    // erreur ni message. Une coupure pendant l'envoi doit afficher « Patient non déplacé ».
    networkMode: 'always',
    mutationFn: ({ visitId, statut }) => deplacerPassage(visitId, statut),
    onMutate: async ({ visitId, statut }) => {
      await queryClient.cancelQueries({ queryKey: cle })
      const avant = queryClient.getQueryData(cle)
      queryClient.setQueryData(cle, (lignes) =>
        (lignes ?? []).map((l) => (l.visit_id === visitId ? { ...l, status: statut } : l)),
      )
      return { avant }
    },
    onError: (erreur, _variables, contexte) => {
      if (contexte?.avant) queryClient.setQueryData(cle, contexte.avant)
      toast.erreur('Patient non déplacé', { message: erreur.message })
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: cle }),
  })
}
