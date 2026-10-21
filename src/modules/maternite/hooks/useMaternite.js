import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useFeature } from '../../../hooks/useFeature.js'
import {
  chargerGrossesse,
  chargerPermissions,
  chargerReglages,
  cles,
  listerGrossessesEnCours,
  listerGrossessesPatiente,
} from '../api.js'

// Droits sur la maternité. Tant qu'ils ne sont pas chargés (ou sans la feature), tout vaut
// false : un bouton non confirmé n'apparaît pas.
export function usePermissionsMaternite(orgId) {
  const incluse = useFeature('maternite').actif
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
    configurer: Boolean(d.configure),
    chargement: incluse && Boolean(orgId) && requete.isPending,
    erreur: requete.error,
  }
}

export function useReglagesMaternite(orgId, actif = true) {
  return useQuery({
    queryKey: cles.reglages(orgId),
    queryFn: () => chargerReglages(orgId),
    enabled: Boolean(orgId) && actif,
    staleTime: 10 * 60 * 1000,
  })
}

// Données cliniques : rien n'est gardé en mémoire après la sortie de l'écran.
export function useGrossessesPatiente(patientId, actif) {
  return useQuery({
    queryKey: cles.grossessesPatiente(patientId),
    queryFn: () => listerGrossessesPatiente(patientId),
    enabled: Boolean(patientId) && actif,
    gcTime: 0,
  })
}

export function useGrossesse(id) {
  return useQuery({
    queryKey: cles.grossesse(id),
    queryFn: () => chargerGrossesse(id),
    enabled: Boolean(id),
    gcTime: 0,
  })
}

export function useGrossessesEnCours(orgId, texte, page, actif) {
  return useQuery({
    queryKey: cles.enCours(orgId, texte, page),
    queryFn: () => listerGrossessesEnCours(orgId, texte, page),
    enabled: Boolean(orgId) && actif,
    placeholderData: keepPreviousData,
    gcTime: 0,
  })
}
