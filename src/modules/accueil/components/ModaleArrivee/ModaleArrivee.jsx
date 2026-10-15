import Button from '../../../../components/ui/Button/Button.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import Modal from '../../../../components/ui/Modal/Modal.jsx'
import { useEnLigne } from '../../../../hooks/useEnLigne.js'
import { enregistrerArrivee } from '../../api.js'
import { usePriorites, useServicesFile } from '../../hooks/useFile.js'
import { useFormulaireAccueil } from '../../hooks/useFormulaireAccueil.js'
import { ARRIVEE_VIDE, ORDRE_CHAMPS_ARRIVEE, validerArrivee } from '../../utils.js'
import BrouillonRetrouve from '../BrouillonRetrouve/BrouillonRetrouve.jsx'
import ChampsArrivee from '../ChampsArrivee/ChampsArrivee.jsx'
import './ModaleArrivee.css'

const ID = 'arrivee'

// Arrivée d'un patient : qui, pour quel service, avec quelle priorité, et le motif.
// Brouillon automatique, effacé après l'enregistrement.
export default function ModaleArrivee({
  orgId,
  peutCreerPatient,
  patientCree,
  onFermer,
  onNouveauPatient,
  onEnregistree,
}) {
  const enLigne = useEnLigne()
  const services = useServicesFile(orgId)
  const priorites = usePriorites()
  const listeServices = services.data ?? []
  const f = useFormulaireAccueil(`accueil.arrivee.${orgId}`, ARRIVEE_VIDE, {
    patientCree,
    serviceParDefaut: listeServices.length === 1 ? listeServices[0].id : '',
  })
  const v = f.v

  async function surEnvoi(evenement) {
    evenement.preventDefault()
    if (f.bloquer(ID, validerArrivee(v), ORDRE_CHAMPS_ARRIVEE)) return
    f.setEnvoi(true)
    f.setEchec(null)
    try {
      const visite = await enregistrerArrivee(orgId, {
        patientId: v.patient.id,
        serviceId: v.serviceId,
        priorite: v.priorite,
        motif: v.motif,
      })
      const service = listeServices.find((s) => s.id === v.serviceId)
      f.brouillon.effacer()
      onEnregistree(visite, service)
    } catch (e) {
      f.setEchec(e.message)
    } finally {
      f.setEnvoi(false)
    }
  }

  return (
    <Modal
      ouvert
      onFermer={onFermer}
      taille="large"
      fermerSurVoile={false}
      titre="Nouvelle arrivée"
      description="Le numéro de ticket est attribué à l’enregistrement, service par service."
      actions={
        <Button
          type="submit"
          form={ID}
          chargement={f.envoi}
          disabled={!enLigne || services.isPending || priorites.isPending}
        >
          Enregistrer l’arrivée
        </Button>
      }
    >
      <form id={ID} className="arrivee" noValidate onSubmit={surEnvoi}>
        <BrouillonRetrouve brouillon={f.brouillon} onEffacer={() => f.setErreurs({})} />
        <ChampsArrivee
          id={ID}
          orgId={orgId}
          saisie={v}
          erreurs={f.erreurs}
          maj={f.maj}
          services={services}
          priorites={priorites}
          peutCreerPatient={peutCreerPatient}
          onNouveauPatient={onNouveauPatient}
        />
        {!enLigne && (
          <Message ton="info" titre="Vous êtes hors ligne">
            <p>La saisie est gardée sur cet appareil. Enregistrez dès le retour de la connexion.</p>
          </Message>
        )}
        {f.echec && (
          <Message ton="erreur" titre="Arrivée non enregistrée">
            <p>{f.echec}</p>
            <p>Votre saisie est conservée sur cet appareil.</p>
          </Message>
        )}
      </form>
    </Modal>
  )
}
