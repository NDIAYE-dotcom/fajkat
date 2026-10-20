import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useFeature } from '../../../hooks/useFeature.js'
import {
  chargerConsultation,
  chargerExamens,
  chargerMesBrouillons,
  chargerPermissions,
  chargerTypes,
  chercherDiagnostics,
  cles,
} from '../api.js'

// Droits sur les consultations. Tant qu'ils ne sont pas chargés (ou sans la feature),
// tout vaut false : un bouton non confirmé n'apparaît pas.
export function usePermissionsConsultation(orgId) {
  const incluse = useFeature('consultations').actif
  const requete = useQuery({
    queryKey: cles.permissions(orgId),
    queryFn: () => chargerPermissions(orgId),
    enabled: Boolean(orgId) && incluse,
    staleTime: 5 * 60 * 1000,
  })
  const d = requete.data ?? {}
  return {
    lire: Boolean(d.read),
    ecrire: Boolean(d.write),
    sensible: Boolean(d.sensitive),
    configurer: Boolean(d.configure),
    chargement: incluse && requete.isPending,
    erreur: requete.error,
  }
}

// Contenu médical : jamais gardé en mémoire après la sortie de l'écran, jamais relu en
// arrière-plan (chaque lecture d'une consultation sensible est journalisée).
export function useConsultation(id) {
  return useQuery({
    queryKey: cles.consultation(id),
    queryFn: () => chargerConsultation(id),
    enabled: Boolean(id),
    gcTime: 0,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  })
}

export function useTypesConsultation(orgId) {
  return useQuery({
    queryKey: cles.types(orgId),
    queryFn: () => chargerTypes(orgId),
    enabled: Boolean(orgId),
    staleTime: 10 * 60 * 1000,
  })
}

export function useExamensRapides(orgId) {
  return useQuery({
    queryKey: cles.examens(orgId),
    queryFn: () => chargerExamens(orgId),
    enabled: Boolean(orgId),
    staleTime: 10 * 60 * 1000,
  })
}

// Sans texte : favoris. Les résultats précédents restent affichés pendant la frappe.
export function useRechercheDiagnostics(orgId, texte, actif = true) {
  return useQuery({
    queryKey: cles.diagnostics(orgId, texte),
    queryFn: () => chercherDiagnostics(orgId, texte),
    enabled: Boolean(orgId) && actif,
    placeholderData: keepPreviousData,
    staleTime: 60 * 1000,
  })
}

// Consultations non validées de l'utilisateur (Journée du jour, page Consultations).
export function useMesBrouillons(orgId, actif = true) {
  return useQuery({
    queryKey: cles.mesBrouillons(orgId),
    queryFn: () => chargerMesBrouillons(orgId),
    enabled: Boolean(orgId) && actif,
    staleTime: 30 * 1000,
  })
}
