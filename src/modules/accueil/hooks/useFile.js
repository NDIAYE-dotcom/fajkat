import { useQuery } from '@tanstack/react-query'
import {
  chargerPermissions,
  chargerPriorites,
  chargerServices,
  chargerTableau,
  cles,
} from '../api.js'

// Droits sur la file d'attente. Tant qu'ils ne sont pas chargés, tout vaut false : un
// bouton non confirmé n'apparaît pas.
export function usePermissionsFile(orgId) {
  const requete = useQuery({
    queryKey: cles.permissions(orgId),
    queryFn: () => chargerPermissions(orgId),
    enabled: Boolean(orgId),
    staleTime: 5 * 60 * 1000,
  })
  const droits = requete.data ?? {}
  return {
    lire: Boolean(droits.read),
    ecrire: Boolean(droits.write),
    medical: Boolean(droits.medical),
    gerer: Boolean(droits.manage),
    vendreTicket: Boolean(droits.sell_ticket),
    chargement: requete.isPending,
  }
}

// Services de la file et priorités : changent rarement.
export function useServicesFile(orgId) {
  return useQuery({
    queryKey: cles.services(orgId),
    queryFn: () => chargerServices(orgId),
    enabled: Boolean(orgId),
    staleTime: 10 * 60 * 1000,
  })
}

export function usePriorites() {
  return useQuery({
    queryKey: cles.priorites(),
    queryFn: chargerPriorites,
    staleTime: 60 * 60 * 1000,
  })
}

// Passages du jour.
export function useTableau(orgId) {
  return useQuery({
    queryKey: cles.tableau(orgId),
    queryFn: () => chargerTableau(orgId),
    enabled: Boolean(orgId),
    staleTime: 15 * 1000,
  })
}
