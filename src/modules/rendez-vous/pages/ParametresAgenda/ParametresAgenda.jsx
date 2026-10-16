import { ArrowLeft } from 'lucide-react'
import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import Button from '../../../../components/ui/Button/Button.jsx'
import Icone from '../../../../components/ui/Icone/Icone.jsx'
import Tabs from '../../../../components/ui/Tabs/Tabs.jsx'
import { useFeature } from '../../../../hooks/useFeature.js'
import { useOrganization } from '../../../../hooks/useOrganization.js'
import FeatureRoute from '../../../../router/guards/FeatureRoute/FeatureRoute.jsx'
import RoleRoute from '../../../../router/guards/RoleRoute/RoleRoute.jsx'
import {
  entreeDepuisChemin,
  offresDeLEntree,
  ROLES_PARAMETRES,
} from '../../../../router/navigation.js'
import OngletJoursFeries from '../../components/OngletJoursFeries/OngletJoursFeries.jsx'
import OngletPauses from '../../components/OngletPauses/OngletPauses.jsx'
import OngletSeances from '../../components/OngletSeances/OngletSeances.jsx'
import OngletTypes from '../../components/OngletTypes/OngletTypes.jsx'
import './ParametresAgenda.css'

const ENTREE = entreeDepuisChemin('/app/rendez-vous')
const ONGLETS = [
  { id: 'types', libelle: 'Types et durées' },
  { id: 'seances', libelle: 'Séances' },
  { id: 'pauses', libelle: 'Pauses' },
  { id: 'feries', libelle: 'Jours fériés' },
]

export default function ParametresAgenda() {
  return (
    <FeatureRoute
      feature={ENTREE.feature}
      libelle={ENTREE.libelle}
      offres={offresDeLEntree(ENTREE)}
    >
      <RoleRoute roles={ROLES_PARAMETRES} libelle="Paramètres de l’agenda">
        <PageParametresAgenda />
      </RoleRoute>
    </FeatureRoute>
  )
}

// Paramètres de l'agenda (owner et admin) : types et durées, séances et capacités,
// pauses, jours fériés. L'onglet ouvert est gardé dans l'adresse (?onglet=).
function PageParametresAgenda() {
  const { structure } = useOrganization()
  const multiPraticiens = useFeature('agenda_multi_praticiens').actif
  const [parametres, setParametres] = useSearchParams()
  const demande = parametres.get('onglet')
  const actif = ONGLETS.some((o) => o.id === demande) ? demande : ONGLETS[0].id

  useEffect(() => {
    document.title = `Paramètres de l’agenda — ${structure.name} — Fajkat`
  }, [structure.name])

  const contenus = {
    types: <OngletTypes orgId={structure.id} />,
    seances: <OngletSeances orgId={structure.id} multiPraticiens={multiPraticiens} />,
    pauses: <OngletPauses orgId={structure.id} />,
    feries: <OngletJoursFeries orgId={structure.id} pays={structure.country_code} />,
  }

  return (
    <div className="parametres-agenda">
      <header className="parametres-agenda__entete">
        <Button variante="discret" to="/app/rendez-vous" iconeDebut={<Icone icone={ArrowLeft} />}>
          Agenda
        </Button>
        <p className="parametres-agenda__surtitre">{structure.name}</p>
        <h1 className="parametres-agenda__titre">Paramètres de l’agenda</h1>
      </header>
      <Tabs
        libelle="Paramètres de l’agenda"
        actif={actif}
        onChange={(id) => setParametres({ onglet: id }, { replace: true })}
        onglets={ONGLETS.map((o) => ({ ...o, contenu: contenus[o.id] }))}
      />
    </div>
  )
}
