import Button from '../../../../components/ui/Button/Button.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import Modal from '../../../../components/ui/Modal/Modal.jsx'
import { useEnLigne } from '../../../../hooks/useEnLigne.js'
import { vendreTicket } from '../../api.js'
import {
  useMotifsGratuite,
  usePrestations,
  usePriorites,
  useServicesFile,
} from '../../hooks/useFile.js'
import { useFormulaireAccueil } from '../../hooks/useFormulaireAccueil.js'
import { ORDRE_CHAMPS_VENTE, VENTE_VIDE, validerVente } from '../../utils.js'
import BrouillonRetrouve from '../BrouillonRetrouve/BrouillonRetrouve.jsx'
import ChampsArrivee from '../ChampsArrivee/ChampsArrivee.jsx'
import ChampsPaiement from '../ChampsPaiement/ChampsPaiement.jsx'
import '../ModaleArrivee/ModaleArrivee.css'

const ID = 'vente-ticket'

// Vente du ticket de consultation à l'entrée d'un poste de santé : un seul geste encaisse
// et enregistre l'arrivée dans la file. Brouillon automatique, effacé après la vente.
export default function ModaleVente({
  orgId,
  peutCreerPatient,
  patientCree,
  onFermer,
  onNouveauPatient,
  onVendu,
}) {
  const enLigne = useEnLigne()
  const services = useServicesFile(orgId)
  const priorites = usePriorites()
  const prestations = usePrestations(orgId)
  const motifs = useMotifsGratuite(orgId)
  const listeServices = services.data ?? []
  // Le ticket mène d'office à la file « Consultation » (ou à l'unique service).
  const parDefaut =
    listeServices.find((s) => s.template_code === 'consultation')?.id ??
    (listeServices.length === 1 ? listeServices[0].id : '')
  const f = useFormulaireAccueil(`accueil.vente.${orgId}`, VENTE_VIDE, {
    patientCree,
    serviceParDefaut: parDefaut,
  })
  const v = f.v
  const prestation = (prestations.data ?? []).find((p) => p.id === v.prestationId)

  async function surEnvoi(evenement) {
    evenement.preventDefault()
    if (f.bloquer(ID, validerVente(v, prestation), ORDRE_CHAMPS_VENTE)) return
    f.setEnvoi(true)
    f.setEchec(null)
    try {
      const vente = await vendreTicket(orgId, v)
      const service = listeServices.find((s) => s.id === v.serviceId)
      f.brouillon.effacer()
      onVendu(vente, service)
    } catch (e) {
      f.setEchec(e.message)
    } finally {
      f.setEnvoi(false)
    }
  }

  const pret = !services.isPending && !priorites.isPending && !prestations.isPending

  return (
    <Modal
      ouvert
      onFermer={onFermer}
      taille="large"
      fermerSurVoile={false}
      titre="Vendre un ticket de consultation"
      description="L’encaissement enregistre aussi l’arrivée du patient dans la file."
      actions={
        <Button type="submit" form={ID} chargement={f.envoi} disabled={!enLigne || !pret}>
          {v.paiement === 'gratuit' ? 'Délivrer le ticket gratuit' : 'Encaisser et délivrer'}
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
        <ChampsPaiement
          id={ID}
          saisie={v}
          erreurs={f.erreurs}
          maj={f.maj}
          prestations={prestations}
          motifs={motifs}
        />
        {!enLigne && (
          <Message ton="info" titre="Vous êtes hors ligne">
            <p>
              La saisie est gardée sur cet appareil. N’encaissez qu’au retour de la connexion : le
              ticket et le reçu doivent être enregistrés.
            </p>
          </Message>
        )}
        {f.echec && (
          <Message ton="erreur" titre="Ticket non vendu">
            <p>{f.echec}</p>
            <p>Rien n’a été encaissé. Votre saisie est conservée sur cet appareil.</p>
          </Message>
        )}
      </form>
    </Modal>
  )
}
