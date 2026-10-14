import { Outlet } from 'react-router-dom'
import EcranAttente from '../../../components/layout/EcranAttente/EcranAttente.jsx'
import ModuleNonInclus from '../../../components/layout/ModuleNonInclus/ModuleNonInclus.jsx'
import Button from '../../../components/ui/Button/Button.jsx'
import { useFeatures } from '../../../hooks/useFeature.js'

// Garde de fonctionnalité : un module que l'offre n'inclut pas affiche une explication
// (et le chemin vers l'abonnement), jamais une page introuvable.
// feature : code requis (null : toujours inclus) ; offres : offres qui l'incluent.
export default function FeatureRoute({ feature, libelle, offres, children }) {
  const { features, chargement, erreur, recharger } = useFeatures()

  if (!feature) return children ?? <Outlet />
  if (chargement) return <EcranAttente integre libelle="Chargement du module…" />
  if (erreur) {
    return (
      <EcranAttente integre libelle="Ce module n’a pas pu être ouvert" erreur={erreur.message}>
        <Button onClick={() => recharger()}>Réessayer</Button>
      </EcranAttente>
    )
  }
  if (!features.includes(feature)) {
    return <ModuleNonInclus libelle={libelle} raison="offre" offres={offres} />
  }
  return children ?? <Outlet />
}
