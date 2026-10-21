import { useMemo } from 'react'
import { entreesVisibles } from '../router/navigation.js'
import { useFeatures } from './useFeature.js'
import { useOrganization } from './useOrganization.js'

// Entrées de navigation visibles pour la structure active et le rôle de l'utilisateur.
// Tant que les fonctionnalités se chargent, seules les entrées sans fonctionnalité
// requise (la Journée du jour) sont proposées : rien n'apparaît puis ne disparaît.
export function useNavigation() {
  const { role, structure } = useOrganization()
  const exerce = Boolean(structure?.exerce)
  const { features, chargement, erreur } = useFeatures()
  const visibles = useMemo(() => entreesVisibles(features, role, exerce), [features, role, exerce])
  const estVisible = (code) => visibles.some((e) => e.code === code)
  return { visibles, estVisible, features, chargement, erreur }
}
