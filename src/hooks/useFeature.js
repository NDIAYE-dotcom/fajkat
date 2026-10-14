import { useQuery } from '@tanstack/react-query'
import { chargerFeatures, cleFeatures, DUREE_CACHE_FEATURES } from '../lib/features.js'

// Toutes les fonctionnalités de la structure, mises en cache par React Query.
// orgId : structure active (sera fourni par OrgContext à l'étape 6).
export function useFeatures(orgId) {
  const requete = useQuery({
    queryKey: cleFeatures(orgId),
    queryFn: () => chargerFeatures(orgId),
    enabled: Boolean(orgId),
    staleTime: DUREE_CACHE_FEATURES,
  })
  return {
    features: requete.data ?? [],
    chargement: Boolean(orgId) && requete.isPending,
    erreur: requete.error,
  }
}

// const { actif, chargement } = useFeature('hospitalisation', orgId)
// Tant que les données ne sont pas chargées, actif vaut false : un module non confirmé
// n'apparaît pas.
export function useFeature(code, orgId) {
  const { features, chargement, erreur } = useFeatures(orgId)
  return { actif: features.includes(code), chargement, erreur }
}
