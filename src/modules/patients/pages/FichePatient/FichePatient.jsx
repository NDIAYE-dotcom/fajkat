import { useQuery } from '@tanstack/react-query'
import { Lock } from 'lucide-react'
import { useEffect } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import EcranAttente from '../../../../components/layout/EcranAttente/EcranAttente.jsx'
import Button from '../../../../components/ui/Button/Button.jsx'
import EmptyState from '../../../../components/ui/EmptyState/EmptyState.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import Tabs from '../../../../components/ui/Tabs/Tabs.jsx'
import { useFeature } from '../../../../hooks/useFeature.js'
import { useOrganization } from '../../../../hooks/useOrganization.js'
import FeatureRoute from '../../../../router/guards/FeatureRoute/FeatureRoute.jsx'
import RoleRoute from '../../../../router/guards/RoleRoute/RoleRoute.jsx'
import { entreeDepuisChemin, offresDeLEntree } from '../../../../router/navigation.js'
import { usePermissionsAgenda } from '../../../rendez-vous/hooks/useParametresAgenda.js'
import { chargerPatient, cles } from '../../api.js'
import EnTeteFiche from '../../components/EnTeteFiche/EnTeteFiche.jsx'
import OngletCouvertures from '../../components/OngletCouvertures/OngletCouvertures.jsx'
import OngletHistorique from '../../components/OngletHistorique/OngletHistorique.jsx'
import OngletIdentite from '../../components/OngletIdentite/OngletIdentite.jsx'
import OngletMedical from '../../components/OngletMedical/OngletMedical.jsx'
import OngletRendezVous from '../../components/OngletRendezVous/OngletRendezVous.jsx'
import { usePermissionsPatients } from '../../hooks/usePermissionsPatients.js'
import { nomComplet } from '../../utils.js'
import './FichePatient.css'

const ENTREE = entreeDepuisChemin('/app/patients')

export default function FichePatient() {
  return (
    <FeatureRoute
      feature={ENTREE.feature}
      libelle={ENTREE.libelle}
      offres={offresDeLEntree(ENTREE)}
    >
      <RoleRoute roles={ENTREE.roles} libelle={ENTREE.libelle}>
        <ChargementFiche />
      </RoleRoute>
    </FeatureRoute>
  )
}

// Dossier hors de portée : jamais le nom du patient, ni la structure, ni la raison exacte
// (inexistant ou autre structure : la base ne renvoie rien dans les deux cas).
function DossierInaccessible() {
  useEffect(() => {
    document.title = 'Dossier inaccessible — Fajkat'
  }, [])
  return (
    <EmptyState
      niveau={1}
      icone={Lock}
      titre="Ce dossier n’est pas accessible avec votre compte"
      texte="Il appartient peut-être à une autre structure. Vérifiez que vous êtes connecté avec le bon compte, ou demandez au responsable de la structure."
      action={<Button to="/app/patients">Retour au registre</Button>}
    />
  )
}

// Charge le dossier (lien direct, carte QR scannée) et ouvre au besoin la bonne structure :
// un même compte peut être membre de plusieurs structures.
function ChargementFiche() {
  const { id } = useParams()
  const { structure, structures, changerStructure } = useOrganization()
  const requete = useQuery({ queryKey: cles.patient(id), queryFn: () => chargerPatient(id) })
  const patient = requete.data
  const autre = patient && patient.org_id !== structure.id
  const membre = patient && structures.some((s) => s.id === patient.org_id)

  useEffect(() => {
    if (autre && membre) changerStructure(patient.org_id)
  }, [autre, membre, patient?.org_id, changerStructure])

  if (requete.isPending) return <EcranAttente integre libelle="Ouverture du dossier…" />
  if (requete.error) {
    return (
      <EcranAttente
        integre
        libelle="Le dossier n’a pas pu être chargé"
        erreur={requete.error.message}
      >
        <Button onClick={() => requete.refetch()}>Réessayer</Button>
      </EcranAttente>
    )
  }
  if (!patient || (autre && !membre)) return <DossierInaccessible />
  if (autre) return <EcranAttente integre libelle="Ouverture de la structure du dossier…" />
  return <Fiche patient={patient} cle={cles.patient(id)} />
}

const ONGLETS = ['identite', 'couvertures', 'rendez-vous', 'medical', 'historique']

function Fiche({ patient, cle }) {
  const { structure } = useOrganization()
  const droits = usePermissionsPatients(structure.id)
  // Rendez-vous : module inclus dans l'offre et rôle qui lit l'agenda.
  const agendaInclus = useFeature('rendez_vous').actif
  const agenda = usePermissionsAgenda(agendaInclus ? structure.id : null).data?.read === true
  const [parametres, setParametres] = useSearchParams()
  const demande = parametres.get('onglet')
  const disponibles = ONGLETS.filter(
    (o) => (o !== 'medical' || droits.medical) && (o !== 'rendez-vous' || agenda),
  )
  const actif = disponibles.includes(demande) ? demande : 'identite'

  useEffect(() => {
    document.title = `${nomComplet(patient)} — Patients — Fajkat`
  }, [patient])

  const onglets = [
    {
      id: 'identite',
      libelle: 'Identité',
      contenu: <OngletIdentite patient={patient} cle={cle} ecrire={droits.ecrire} />,
    },
    {
      id: 'couvertures',
      libelle: 'Couvertures',
      contenu: <OngletCouvertures patient={patient} ecrire={droits.ecrire} />,
    },
    agenda && {
      id: 'rendez-vous',
      libelle: 'Rendez-vous',
      contenu: actif === 'rendez-vous' ? <OngletRendezVous patient={patient} /> : null,
    },
    // Monté seulement quand il est ouvert : chaque lecture d'antécédents sensibles est
    // journalisée, elle ne doit pas avoir lieu à la simple ouverture de la fiche.
    droits.medical && {
      id: 'medical',
      libelle: 'Médical',
      contenu: actif === 'medical' ? <OngletMedical patient={patient} /> : null,
    },
    { id: 'historique', libelle: 'Historique', contenu: <OngletHistorique /> },
  ].filter(Boolean)

  return (
    <div className="fiche-patient">
      {patient.fusionneDepuis && (
        <Message ton="info" titre="Dossier fusionné">
          <p>Le dossier demandé a été fusionné dans celui-ci, qui est le dossier conservé.</p>
        </Message>
      )}
      <EnTeteFiche
        patient={patient}
        cle={cle}
        ecrire={droits.ecrire}
        fusionner={droits.fusionner && droits.ecrire}
      />
      <Tabs
        libelle="Rubriques du dossier"
        actif={actif}
        onChange={(onglet) => setParametres({ onglet }, { replace: true })}
        onglets={onglets}
      />
    </div>
  )
}
