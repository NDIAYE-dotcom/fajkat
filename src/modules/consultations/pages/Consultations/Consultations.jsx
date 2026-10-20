import { Stethoscope } from 'lucide-react'
import { useEffect } from 'react'
import EcranAttente from '../../../../components/layout/EcranAttente/EcranAttente.jsx'
import Button from '../../../../components/ui/Button/Button.jsx'
import EmptyState from '../../../../components/ui/EmptyState/EmptyState.jsx'
import { useOrganization } from '../../../../hooks/useOrganization.js'
import FeatureRoute from '../../../../router/guards/FeatureRoute/FeatureRoute.jsx'
import RoleRoute from '../../../../router/guards/RoleRoute/RoleRoute.jsx'
import { entreeDepuisChemin, offresDeLEntree } from '../../../../router/navigation.js'
import BrouillonsEnCours from '../../components/BrouillonsEnCours/BrouillonsEnCours.jsx'
import ReserveAuxSoignants from '../../components/ReserveAuxSoignants/ReserveAuxSoignants.jsx'
import { usePermissionsConsultation } from '../../hooks/useConsultation.js'
import './Consultations.css'

const ENTREE = entreeDepuisChemin('/app/consultations')

export default function Consultations() {
  return (
    <FeatureRoute
      feature={ENTREE.feature}
      libelle={ENTREE.libelle}
      offres={offresDeLEntree(ENTREE)}
    >
      <RoleRoute roles={ENTREE.roles} libelle={ENTREE.libelle}>
        <PageConsultations />
      </RoleRoute>
    </FeatureRoute>
  )
}

// Consultations : celles que l'utilisateur a commencées et pas encore validées. Une
// consultation se commence depuis la file d'attente ou la fiche du patient.
function PageConsultations() {
  const { structure } = useOrganization()
  const droits = usePermissionsConsultation(structure.id)

  useEffect(() => {
    document.title = `Consultations — ${structure.name} — Fajkat`
  }, [structure.name])

  if (droits.chargement) return <EcranAttente integre libelle="Chargement des consultations…" />
  if (!droits.lire) return <ReserveAuxSoignants />
  return (
    <div className="consultations">
      <h1 className="consultations__titre">Consultations</h1>
      <p className="consultations__aide">
        Commencez une consultation depuis la file d’attente (carte « En consultation ») ou depuis la
        fiche du patient.
      </p>
      {droits.ecrire ? (
        <BrouillonsEnCours
          orgId={structure.id}
          vide={
            <EmptyState
              icone={Stethoscope}
              titre="Aucune consultation en cours"
              texte="Les consultations que vous commencez et ne validez pas tout de suite s’affichent ici."
              action={<Button to="/app/file-attente">Ouvrir la file d’attente</Button>}
            />
          }
        />
      ) : (
        <EmptyState
          icone={Stethoscope}
          titre="Lecture seule"
          texte="Votre rôle permet de lire les consultations, pas d’en rédiger."
        />
      )}
    </div>
  )
}
