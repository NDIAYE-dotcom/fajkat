import { useQueryClient } from '@tanstack/react-query'
import { useToast } from '../../../../hooks/useToast.js'
import { formatHeure } from '../../../../lib/format.js'
import ModaleTicket from '../../../accueil/components/ModaleTicket/ModaleTicket.jsx'
import { chargerPatient } from '../../../patients/api.js'
import ModaleNouveauPatient from '../../../patients/components/ModaleNouveauPatient/ModaleNouveauPatient.jsx'
import { useServicesFile } from '../../hooks/useParametresAgenda.js'
import { dateFr } from '../../utils.js'
import ModaleAnnulation from '../ModaleAnnulation/ModaleAnnulation.jsx'
import ModaleArriveeRdv from '../ModaleArriveeRdv/ModaleArriveeRdv.jsx'
import ModalePlanning from '../ModalePlanning/ModalePlanning.jsx'
import ModalePriseRdv from '../ModalePriseRdv/ModalePriseRdv.jsx'
import ModaleRdv from '../ModaleRdv/ModaleRdv.jsx'
import ModaleReporterRdv from '../ModaleReporterRdv/ModaleReporterRdv.jsx'
import ModaleSerie from '../ModaleSerie/ModaleSerie.jsx'
import ModaleTypeRdv from '../ModaleTypeRdv/ModaleTypeRdv.jsx'

// Fenêtres de l'agenda, l'une après l'autre (jamais deux <dialog> ouverts) :
//   { type: 'prise' | 'serie', patientCree? }  nouveau rendez-vous, ou série
//   { type: 'nouveau-patient', retour }        création rapide, puis retour à la saisie
//   { type: 'rdv' | 'report' | 'type' | 'annulation' | 'arrivee', rdv }
//   { type: 'ticket', visite }                 ticket de file après « Arrivé »
//   { type: 'planning', date }                 planning du jour imprimé
// La saisie de la prise est gardée en brouillon pendant la création d'un dossier.
export default function FenetresAgenda({
  orgId,
  structure,
  droits,
  multiPraticiens,
  peutCreerPatient,
  rdvDuJour,
  fenetre,
  setFenetre,
}) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const services = useServicesFile(orgId)
  if (!fenetre) return null

  function actualiser() {
    queryClient.invalidateQueries({ queryKey: ['rendez-vous', 'agenda', orgId] })
    queryClient.invalidateQueries({ queryKey: ['rendez-vous', 'jour', orgId] })
    queryClient.invalidateQueries({ queryKey: ['rendez-vous', 'propositions'] })
    queryClient.invalidateQueries({ queryKey: ['rendez-vous', 'rappels', orgId] })
    queryClient.invalidateQueries({ queryKey: ['rendez-vous', 'patient'] })
  }

  function quand(rdv) {
    return `le ${dateFr(rdv.local_date)} à ${formatHeure(rdv.starts_at)}`
  }

  async function reprendre(retour, idOuPatient) {
    try {
      const patient =
        typeof idOuPatient === 'string' ? await chargerPatient(idOuPatient) : idOuPatient
      if (!patient) throw new Error('Ce dossier est introuvable.')
      setFenetre({ type: retour, patientCree: patient })
    } catch (e) {
      toast.erreur('Dossier non ouvert', { message: e.message })
    }
  }

  const fermer = () => setFenetre(null)
  const versRdv = (rdv) => () => setFenetre({ type: 'rdv', rdv })

  switch (fenetre.type) {
    case 'prise':
      return (
        <ModalePriseRdv
          orgId={orgId}
          multiPraticiens={multiPraticiens}
          // Note de rendez-vous : soignants habilités seulement (droit « discreet »).
          medical={droits.discreet === true}
          peutCreerPatient={peutCreerPatient}
          patientCree={fenetre.patientCree ?? null}
          onFermer={fermer}
          onNouveauPatient={() => setFenetre({ type: 'nouveau-patient', retour: 'prise' })}
          onPris={(rdv) => {
            actualiser()
            toast.succes(rdv ? `Rendez-vous pris ${quand(rdv)}` : 'Rendez-vous pris')
            fermer()
          }}
        />
      )
    case 'serie':
      return (
        <ModaleSerie
          orgId={orgId}
          multiPraticiens={multiPraticiens}
          medical={droits.discreet === true}
          peutCreerPatient={peutCreerPatient}
          patientCree={fenetre.patientCree ?? null}
          onFermer={fermer}
          onNouveauPatient={() => setFenetre({ type: 'nouveau-patient', retour: 'serie' })}
          onPrise={(liste) => {
            actualiser()
            toast.succes(`Série de ${liste.length} rendez-vous enregistrée`)
            fermer()
          }}
        />
      )
    case 'nouveau-patient':
      return (
        <ModaleNouveauPatient
          orgId={orgId}
          ouvert
          onFermer={() => setFenetre({ type: fenetre.retour ?? 'prise' })}
          onOuvrir={(id) => reprendre(fenetre.retour ?? 'prise', id)}
          onCree={(patient) => {
            toast.succes(`Dossier ${patient.file_number} créé`)
            reprendre(fenetre.retour ?? 'prise', patient)
          }}
        />
      )
    case 'rdv':
      return (
        <ModaleRdv
          rdv={fenetre.rdv}
          droits={droits}
          onFermer={fermer}
          onReporter={() => setFenetre({ type: 'report', rdv: fenetre.rdv })}
          onChangerType={() => setFenetre({ type: 'type', rdv: fenetre.rdv })}
          onAnnuler={() => setFenetre({ type: 'annulation', rdv: fenetre.rdv })}
          onArrivee={() => setFenetre({ type: 'arrivee', rdv: fenetre.rdv })}
          onStatut={(rdv, message) => {
            actualiser()
            toast.succes(message)
            setFenetre({ type: 'rdv', rdv })
          }}
        />
      )
    case 'annulation':
      return (
        <ModaleAnnulation
          rdv={fenetre.rdv}
          onFermer={versRdv(fenetre.rdv)}
          onAnnule={() => {
            actualiser()
            toast.succes('Rendez-vous annulé')
            fermer()
          }}
        />
      )
    case 'arrivee':
      return (
        <ModaleArriveeRdv
          orgId={orgId}
          rdv={fenetre.rdv}
          onFermer={versRdv(fenetre.rdv)}
          onArrive={(visite) => {
            actualiser()
            queryClient.invalidateQueries({ queryKey: ['accueil'] })
            setFenetre({ type: 'ticket', visite })
          }}
        />
      )
    case 'ticket':
      return (
        <ModaleTicket
          structureNom={structure.name}
          visite={fenetre.visite}
          service={services.data?.find((s) => s.id === fenetre.visite.queue_service_id)?.label}
          nouveau
          onFermer={fermer}
        />
      )
    case 'planning':
      return (
        <ModalePlanning
          structure={structure}
          date={fenetre.date}
          rdv={rdvDuJour}
          medical={droits.medical}
          multiPraticiens={multiPraticiens}
          onFermer={fermer}
        />
      )
    case 'report':
      return (
        <ModaleReporterRdv
          orgId={orgId}
          rdv={fenetre.rdv}
          multiPraticiens={multiPraticiens}
          onFermer={versRdv(fenetre.rdv)}
          onReporte={(nouveau) => {
            actualiser()
            toast.succes(nouveau ? `Rendez-vous reporté ${quand(nouveau)}` : 'Rendez-vous reporté')
            fermer()
          }}
        />
      )
    case 'type':
      return (
        <ModaleTypeRdv
          orgId={orgId}
          rdv={fenetre.rdv}
          onFermer={versRdv(fenetre.rdv)}
          onChange={() => {
            actualiser()
            toast.succes('Type du rendez-vous changé')
            fermer()
          }}
        />
      )
    default:
      return null
  }
}
