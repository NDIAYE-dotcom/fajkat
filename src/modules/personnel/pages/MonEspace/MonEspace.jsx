import { useEffect } from 'react'
import { useAuth } from '../../../../hooks/useAuth.js'
import { useOrganization } from '../../../../hooks/useOrganization.js'
import FeatureRoute from '../../../../router/guards/FeatureRoute/FeatureRoute.jsx'
import RoleRoute from '../../../../router/guards/RoleRoute/RoleRoute.jsx'
import { entreeDepuisChemin, offresDeLEntree } from '../../../../router/navigation.js'
import MaFiche from '../../components/MaFiche/MaFiche.jsx'
import './MonEspace.css'

const ENTREE = entreeDepuisChemin('/app/mon-espace')

// Espace de chaque membre dans la structure active : sa fiche (puis ses gardes, son
// pointage et ses congés).
export default function MonEspace() {
  return (
    <FeatureRoute
      feature={ENTREE.feature}
      libelle={ENTREE.libelle}
      offres={offresDeLEntree(ENTREE)}
    >
      <RoleRoute roles={ENTREE.roles} libelle={ENTREE.libelle}>
        <PageMonEspace />
      </RoleRoute>
    </FeatureRoute>
  )
}

function PageMonEspace() {
  const { structure, role } = useOrganization()
  const { utilisateur } = useAuth()

  useEffect(() => {
    document.title = `Mon espace — ${structure.name} — Fajkat`
  }, [structure.name])

  return (
    <div className="mon-espace">
      <header className="mon-espace__entete">
        <p className="mon-espace__surtitre">{structure.name}</p>
        <h1 className="mon-espace__titre">Mon espace</h1>
      </header>
      <MaFiche
        orgId={structure.id}
        userId={utilisateur.id}
        responsable={role === 'owner' || role === 'admin'}
      />
    </div>
  )
}
