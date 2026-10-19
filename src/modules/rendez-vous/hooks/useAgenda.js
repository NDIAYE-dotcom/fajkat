import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { chargerAgenda, chargerFeriesPeriode, cles } from '../api.js'

// Rendez-vous d'une période. Pendant le passage à la période suivante, l'ancienne reste
// affichée (pas d'écran vide entre deux semaines). Relu au retour sur l'onglet.
export function useAgenda(orgId, du, au) {
  return useQuery({
    queryKey: cles.agenda(orgId, du, au),
    queryFn: () => chargerAgenda(orgId, du, au),
    enabled: Boolean(orgId),
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000,
  })
}

export function useFeriesPeriode(orgId, du, au) {
  return useQuery({
    queryKey: cles.feriesPeriode(orgId, du, au),
    queryFn: () => chargerFeriesPeriode(orgId, du, au),
    enabled: Boolean(orgId),
    placeholderData: keepPreviousData,
    staleTime: 5 * 60 * 1000,
  })
}
