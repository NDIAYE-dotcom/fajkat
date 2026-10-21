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
import Antecedents from '../../../consultations/components/Antecedents/Antecedents.jsx'
import Chronologie from '../../../consultations/components/Chronologie/Chronologie.jsx'
import { usePermissionsConsultation } from '../../../consultations/hooks/useConsultation.js'
import OngletGrossesse from '../../../maternite/components/OngletGrossesse/OngletGrossesse.jsx'
import { usePermissionsMaternite } from '../../../maternite/hooks/useMaternite.js'
import { usePermissionsAgenda } from '../../../rendez-vous/hooks/useParametresAgenda.js'
import { chargerPatient, cles } from '../../api.js'
import EnTeteFiche from '../../components/EnTeteFiche/EnTeteFiche.jsx'
import OngletCouvertures from '../../components/OngletCouvertures/OngletCouvertures.jsx'
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

const ONGLETS = ['identite', 'couvertures', 'rendez-vous', 'grossesse', 'medical', 'chronologie']

function Fiche({ patient, cle }) {
  const { structure } = useOrganization()
  const droits = usePermissionsPatients(structure.id)
  const dossier = usePermissionsConsultation(droits.medical ? structure.id : null)
  // Grossesse : patiente, et rôle médical avec la feature maternite.
  const maternite = usePermissionsMaternite(
    droits.medical && patient.sex === 'F' ? structure.id : null,
  )
  // Rendez-vous : module inclus dans l'offre et rôle qui lit l'agenda.
  const agendaInclus = useFeature('rendez_vous').actif
  const agenda = usePermissionsAgenda(agendaInclus ? structure.id : null).data?.read === true
  const [parametres, setParametres] = useSearchParams()
  const demande = parametres.get('onglet')
  const disponibles = ONGLETS.filter(
    (o) =>
      (o !== 'medical' || droits.medical) &&
      (o !== 'rendez-vous' || agenda) &&
      (o !== 'grossesse' || maternite.lire),
  )
  // Lien direct vers ?onglet=grossesse : on attend les droits avant de choisir l'onglet.
  const enAttente = demande === 'grossesse' && maternite.chargement
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
    maternite.lire && {
      id: 'grossesse',
      libelle: 'Grossesse',
      contenu:
        actif === 'grossesse' ? (
          <OngletGrossesse patient={patient} droits={maternite} dossier={dossier} />
        ) : null,
    },
    // Monté seulement quand il est ouvert : chaque ouverture d'antécédents sensibles est
    // journalisée, elle ne doit pas avoir lieu à la simple ouverture de la fiche.
    droits.medical && {
      id: 'medical',
      libelle: 'Médical',
      contenu:
        actif === 'medical' ? (
          <div className="fiche-patient__medical">
            <OngletMedical patient={patient} />
            {dossier.lire && (
              <section className="fiche-patient__antecedents" aria-labelledby="fiche-antecedents">
                <h2 id="fiche-antecedents" className="fiche-patient__sous-titre">
                  Antécédents
                </h2>
                <Antecedents
                  patientId={patient.id}
                  ecrire={dossier.ecrire}
                  habilite={dossier.sensible}
                />
              </section>
            )}
          </div>
        ) : null,
    },
    // Chronologie : la base ne renvoie à chacun que ce qu'il peut voir.
    {
      id: 'chronologie',
      libelle: 'Chronologie',
      contenu:
        actif === 'chronologie' ? (
          <Chronologie patientId={patient.id} medical={dossier.lire} />
        ) : null,
    },
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
        consultation={dossier.ecrire}
      />
      {enAttente ? (
        <EcranAttente integre libelle="Ouverture du suivi de grossesse…" />
      ) : (
        <Tabs
          libelle="Rubriques du dossier"
          actif={actif}
          onChange={(onglet) => setParametres({ onglet }, { replace: true })}
          onglets={onglets}
        />
      )}
    </div>
  )
}
