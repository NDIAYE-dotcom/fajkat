import { useQuery } from '@tanstack/react-query'
import { useContext } from 'react'
import { OrgContexte } from '../context/orgContexte.js'
import { chargerFeatures, cleFeatures, DUREE_CACHE_FEATURES } from '../lib/features.js'

// Toutes les fonctionnalités d'une structure, mises en cache par React Query.
// orgId : facultatif, par défaut la structure active (OrgContext).
export function useFeatures(orgId) {
  const org = useContext(OrgContexte)
  const id = orgId ?? org?.structure?.id ?? null
  const requete = useQuery({
    queryKey: cleFeatures(id),
    queryFn: () => chargerFeatures(id),
    enabled: Boolean(id),
    staleTime: DUREE_CACHE_FEATURES,
  })
  return {
    features: requete.data ?? [],
    chargement: Boolean(id) && requete.isPending,
    erreur: requete.error,
    recharger: requete.refetch,
  }
}

// const { actif, chargement } = useFeature('hospitalisation')
// Tant que les données ne sont pas chargées, actif vaut false : un module non confirmé
// n'apparaît pas.
export function useFeature(code, orgId) {
  const { features, chargement, erreur } = useFeatures(orgId)
  return { actif: features.includes(code), chargement, erreur }
}
