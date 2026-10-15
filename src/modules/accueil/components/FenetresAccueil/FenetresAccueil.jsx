import { useQueryClient } from '@tanstack/react-query'
import { useToast } from '../../../../hooks/useToast.js'
import { chargerPatient } from '../../../patients/api.js'
import ModaleNouveauPatient from '../../../patients/components/ModaleNouveauPatient/ModaleNouveauPatient.jsx'
import { cles } from '../../api.js'
import ModaleArrivee from '../ModaleArrivee/ModaleArrivee.jsx'
import ModaleTicket from '../ModaleTicket/ModaleTicket.jsx'
import ModaleVente from '../ModaleVente/ModaleVente.jsx'

// Fenêtres de l'accueil, l'une après l'autre (jamais deux <dialog> ouverts) :
//   { type: 'arrivee' | 'vente', patientCree? }
//   { type: 'nouveau-patient', retour: 'arrivee' | 'vente' }
//   { type: 'ticket', visite, service, recu?, gratuite?, nouveau }
// La saisie de l'arrivée ou de la vente est gardée en brouillon pendant la création d'un
// dossier, puis reprise avec ce dossier.
export default function FenetresAccueil({
  orgId,
  structureNom,
  peutCreerPatient,
  fenetre,
  setFenetre,
}) {
  const queryClient = useQueryClient()
  const toast = useToast()
  if (!fenetre) return null

  function actualiser() {
    queryClient.invalidateQueries({ queryKey: cles.tableau(orgId) })
    queryClient.invalidateQueries({ queryKey: cles.tickets(orgId) })
    queryClient.invalidateQueries({ queryKey: cles.bilan(orgId) })
  }

  // Patient créé, ou dossier proche ouvert depuis l'alerte de doublons : retour à la saisie.
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

  const communs = {
    orgId,
    peutCreerPatient,
    patientCree: fenetre.patientCree ?? null,
    onFermer: () => setFenetre(null),
  }

  switch (fenetre.type) {
    case 'arrivee':
      return (
        <ModaleArrivee
          {...communs}
          onNouveauPatient={() => setFenetre({ type: 'nouveau-patient', retour: 'arrivee' })}
          onEnregistree={(visite, service) => {
            actualiser()
            setFenetre({ type: 'ticket', visite, service: service?.label, nouveau: true })
          }}
        />
      )
    case 'vente':
      return (
        <ModaleVente
          {...communs}
          onNouveauPatient={() => setFenetre({ type: 'nouveau-patient', retour: 'vente' })}
          onVendu={(vente, service) => {
            actualiser()
            setFenetre({
              type: 'ticket',
              visite: vente,
              service: service?.label,
              recu: vente.receipt_number ? vente : null,
              gratuite: vente.exemption_reason,
              nouveau: true,
            })
          }}
        />
      )
    case 'nouveau-patient':
      return (
        <ModaleNouveauPatient
          orgId={orgId}
          ouvert
          onFermer={() => setFenetre({ type: fenetre.retour })}
          onOuvrir={(id) => reprendre(fenetre.retour, id)}
          onCree={(patient) => {
            toast.succes(`Dossier ${patient.file_number} créé`)
            reprendre(fenetre.retour, patient)
          }}
        />
      )
    case 'ticket':
      return (
        <ModaleTicket
          structureNom={structureNom}
          visite={fenetre.visite}
          service={fenetre.service}
          recu={fenetre.recu}
          gratuite={fenetre.gratuite}
          nouveau={fenetre.nouveau}
          onFermer={() => setFenetre(null)}
        />
      )
    default:
      return null
  }
}
