import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useCanalSecours } from '../../../hooks/useCanalSecours.js'
import { useToast } from '../../../hooks/useToast.js'
import { chargerSalles, cles, deplacerPassage, ecouterFile } from '../api.js'

// Rafraîchissement regroupé : plusieurs changements rapprochés (appel du suivant, arrivée
// sur un autre poste) ne déclenchent qu'une relecture.
const DELAI_RELECTURE_MS = 400

// Le tableau (et les arrivées du jour) se met à jour seul quand la file change sur un
// autre appareil. Canal coupé : rouvert, et relecture toutes les 60 s, au retour du réseau
// et au retour sur l'onglet (useCanalSecours). Renvoie true si le temps réel est actif.
export function useFileTempsReel(orgId) {
  const queryClient = useQueryClient()
  const minuteur = useRef(null)
  const relire = useCallback(() => {
    clearTimeout(minuteur.current)
    minuteur.current = setTimeout(
      () => queryClient.invalidateQueries({ queryKey: cles.tableau(orgId) }),
      DELAI_RELECTURE_MS,
    )
  }, [orgId, queryClient])
  useEffect(() => () => clearTimeout(minuteur.current), [])
  const ouvrir = useCallback(
    (surEtat) => ecouterFile(orgId, { surChangement: relire, surEtat }),
    [orgId, relire],
  )
  return useCanalSecours(ouvrir, relire, { actif: Boolean(orgId) })
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
