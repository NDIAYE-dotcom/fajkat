import { useQueryClient } from '@tanstack/react-query'
import { useToast } from '../../../../hooks/useToast.js'
import { formatHeure } from '../../../../lib/format.js'
import { chargerPatient } from '../../../patients/api.js'
import ModaleNouveauPatient from '../../../patients/components/ModaleNouveauPatient/ModaleNouveauPatient.jsx'
import { dateFr } from '../../utils.js'
import ModalePriseRdv from '../ModalePriseRdv/ModalePriseRdv.jsx'
import ModaleRdv from '../ModaleRdv/ModaleRdv.jsx'
import ModaleReporterRdv from '../ModaleReporterRdv/ModaleReporterRdv.jsx'
import ModaleTypeRdv from '../ModaleTypeRdv/ModaleTypeRdv.jsx'

// Fenêtres de l'agenda, l'une après l'autre (jamais deux <dialog> ouverts) :
//   { type: 'prise', patientCree? }            nouveau rendez-vous
//   { type: 'nouveau-patient' }               création rapide, puis retour à la prise
//   { type: 'rdv' | 'report' | 'type', rdv }  détail, report, changement de type
// La saisie de la prise est gardée en brouillon pendant la création d'un dossier.
export default function FenetresAgenda({
  orgId,
  droits,
  multiPraticiens,
  peutCreerPatient,
  fenetre,
  setFenetre,
}) {
  const queryClient = useQueryClient()
  const toast = useToast()
  if (!fenetre) return null

  function actualiser() {
    queryClient.invalidateQueries({ queryKey: ['rendez-vous', 'agenda', orgId] })
    queryClient.invalidateQueries({ queryKey: ['rendez-vous', 'jour', orgId] })
    queryClient.invalidateQueries({ queryKey: ['rendez-vous', 'propositions'] })
  }

  function quand(rdv) {
    return `le ${dateFr(rdv.local_date)} à ${formatHeure(rdv.starts_at)}`
  }

  async function reprendre(idOuPatient) {
    try {
      const patient =
        typeof idOuPatient === 'string' ? await chargerPatient(idOuPatient) : idOuPatient
      if (!patient) throw new Error('Ce dossier est introuvable.')
      setFenetre({ type: 'prise', patientCree: patient })
    } catch (e) {
      toast.erreur('Dossier non ouvert', { message: e.message })
    }
  }

  const fermer = () => setFenetre(null)

  switch (fenetre.type) {
    case 'prise':
      return (
        <ModalePriseRdv
          orgId={orgId}
          multiPraticiens={multiPraticiens}
          medical={droits.medical}
          peutCreerPatient={peutCreerPatient}
          patientCree={fenetre.patientCree ?? null}
          onFermer={fermer}
          onNouveauPatient={() => setFenetre({ type: 'nouveau-patient' })}
          onPris={(rdv) => {
            actualiser()
            toast.succes(rdv ? `Rendez-vous pris ${quand(rdv)}` : 'Rendez-vous pris')
            fermer()
          }}
        />
      )
    case 'nouveau-patient':
      return (
        <ModaleNouveauPatient
          orgId={orgId}
          ouvert
          onFermer={() => setFenetre({ type: 'prise' })}
          onOuvrir={(id) => reprendre(id)}
          onCree={(patient) => {
            toast.succes(`Dossier ${patient.file_number} créé`)
            reprendre(patient)
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
        />
      )
    case 'report':
      return (
        <ModaleReporterRdv
          orgId={orgId}
          rdv={fenetre.rdv}
          multiPraticiens={multiPraticiens}
          onFermer={() => setFenetre({ type: 'rdv', rdv: fenetre.rdv })}
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
          onFermer={() => setFenetre({ type: 'rdv', rdv: fenetre.rdv })}
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
