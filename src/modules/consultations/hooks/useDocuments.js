import { useQuery } from '@tanstack/react-query'
import {
  chargerCertificat,
  chargerDestinations,
  chargerModelesCertificat,
  chargerReference,
  chargerSuivis,
  cles,
  listerReferences,
} from '../api.js'
import { useOuverture } from './useConsultation.js'

// Documents de la consultation (partie E). Contenu médical (référence, certificat) : jamais
// gardé après la fermeture de la fenêtre, jamais relu en arrière-plan (une lecture d'un
// document sensible est journalisée).
const SANS_CACHE = { gcTime: 0, staleTime: Infinity, refetchOnWindowFocus: false, retry: false }

export function useSuivis(consultationId, actif = true) {
  return useQuery({
    queryKey: cles.suivis(consultationId),
    queryFn: () => chargerSuivis(consultationId),
    enabled: Boolean(consultationId) && actif,
    staleTime: 30 * 1000,
  })
}

export function useDestinations(orgId, actif = true) {
  return useQuery({
    queryKey: cles.destinations(orgId),
    queryFn: () => chargerDestinations(orgId),
    enabled: Boolean(orgId) && actif,
    staleTime: 5 * 60 * 1000,
  })
}

export function useModelesCertificat(orgId, actif = true) {
  return useQuery({
    queryKey: cles.modelesCertificat(orgId),
    queryFn: () => chargerModelesCertificat(orgId),
    enabled: Boolean(orgId) && actif,
    staleTime: 5 * 60 * 1000,
  })
}

export function useReference(id) {
  const ouverture = useOuverture()
  return useQuery({
    queryKey: cles.reference(id),
    queryFn: () => chargerReference(id, ouverture),
    enabled: Boolean(id),
    ...SANS_CACHE,
  })
}

export function useCertificat(id) {
  const ouverture = useOuverture()
  return useQuery({
    queryKey: cles.certificat(id),
    queryFn: () => chargerCertificat(id, ouverture),
    enabled: Boolean(id),
    ...SANS_CACHE,
  })
}

// statut : 'pending' | 'returned'.
export function useReferences(orgId, statut, actif = true) {
  return useQuery({
    queryKey: cles.references(orgId, statut),
    queryFn: () => listerReferences(orgId, statut),
    enabled: Boolean(orgId) && actif,
    staleTime: 30 * 1000,
  })
}
