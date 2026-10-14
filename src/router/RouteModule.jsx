import { useLocation } from 'react-router-dom'
import NonTrouve from '../pages/NonTrouve/NonTrouve.jsx'
import ModuleEnPreparation from '../pages/ModuleEnPreparation/ModuleEnPreparation.jsx'
import FeatureRoute from './guards/FeatureRoute/FeatureRoute.jsx'
import RoleRoute from './guards/RoleRoute/RoleRoute.jsx'
import { entreeDepuisChemin, offresDeLEntree } from './navigation.js'

// Toute adresse /app/<module> sans page dédiée : gardes d'offre et de rôle, puis
// « Module en préparation ». Les modules construits aux étapes suivantes déclarent
// leur propre route dans routes.jsx, qui passe avant celle-ci.
export default function RouteModule() {
  const { pathname } = useLocation()
  const entree = entreeDepuisChemin(pathname)
  if (!entree || !entree.chemin) return <NonTrouve integre />

  return (
    <FeatureRoute
      feature={entree.feature}
      libelle={entree.libelle}
      offres={offresDeLEntree(entree)}
    >
      <RoleRoute roles={entree.roles} libelle={entree.libelle}>
        <ModuleEnPreparation key={entree.code} entree={entree} />
      </RoleRoute>
    </FeatureRoute>
  )
}
