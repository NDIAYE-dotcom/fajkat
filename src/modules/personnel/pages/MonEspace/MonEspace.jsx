import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import Tabs from '../../../../components/ui/Tabs/Tabs.jsx'
import { useAuth } from '../../../../hooks/useAuth.js'
import { useOrganization } from '../../../../hooks/useOrganization.js'
import FeatureRoute from '../../../../router/guards/FeatureRoute/FeatureRoute.jsx'
import RoleRoute from '../../../../router/guards/RoleRoute/RoleRoute.jsx'
import { entreeDepuisChemin, offresDeLEntree } from '../../../../router/navigation.js'
import MaFiche from '../../components/MaFiche/MaFiche.jsx'
import PlanningSemaine from '../../components/PlanningSemaine/PlanningSemaine.jsx'
import './MonEspace.css'

const ENTREE = entreeDepuisChemin('/app/mon-espace')
const ONGLETS = ['fiche', 'planning']

// Espace de chaque membre dans la structure active : sa fiche et le planning de l'équipe
// (puis son pointage et ses congés).
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
  const [parametres, setParametres] = useSearchParams()
  const responsable = role === 'owner' || role === 'admin'
  const demande = parametres.get('onglet')
  const actif = ONGLETS.includes(demande) ? demande : 'fiche'

  useEffect(() => {
    document.title = `Mon espace — ${structure.name} — Fajkat`
  }, [structure.name])

  return (
    <div className="mon-espace">
      <header className="mon-espace__entete">
        <p className="mon-espace__surtitre">{structure.name}</p>
        <h1 className="mon-espace__titre">Mon espace</h1>
      </header>
      <Tabs
        libelle="Rubriques de mon espace"
        actif={actif}
        onChange={(id) => setParametres({ onglet: id }, { replace: true })}
        onglets={[
          {
            id: 'fiche',
            libelle: 'Ma fiche',
            contenu: (
              <MaFiche orgId={structure.id} userId={utilisateur.id} responsable={responsable} />
            ),
          },
          {
            id: 'planning',
            libelle: 'Planning',
            // Lecture seule ici : les responsables affectent depuis le module Personnel.
            contenu: (
              <PlanningSemaine structure={structure} modifiable={false} moi={utilisateur.id} />
            ),
          },
        ]}
      />
    </div>
  )
}
