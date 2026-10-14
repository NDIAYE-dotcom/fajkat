import { useState } from 'react'
import Button from '../../../../components/ui/Button/Button.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import Modal from '../../../../components/ui/Modal/Modal.jsx'
import Tampon from '../../../../components/ui/Tampon/Tampon.jsx'
import { useToast } from '../../../../hooks/useToast.js'
import { formatDate } from '../../../../lib/format.js'
import { annulerConge } from '../../api.js'
import { libelleTypeConge, periodeConge, STATUTS_CONGE } from '../../utils.js'
import './ModaleMaDemande.css'

// Une de mes demandes de congé, ouverte depuis une notification : statut, réponse du
// responsable, annulation tant qu'elle est en attente.
export default function ModaleMaDemande({ conge, onFermer, onAnnulee }) {
  const toast = useToast()
  const [envoi, setEnvoi] = useState(false)
  const [echec, setEchec] = useState(null)
  const statut = STATUTS_CONGE[conge.status]

  async function annuler() {
    setEnvoi(true)
    setEchec(null)
    try {
      await annulerConge(conge.id)
      toast.succes('Demande annulée')
      onAnnulee()
    } catch (e) {
      setEchec(e.message)
      setEnvoi(false)
    }
  }

  return (
    <Modal
      ouvert
      onFermer={onFermer}
      titre={libelleTypeConge(conge.leave_type)}
      description={periodeConge(conge.start_date, conge.end_date)}
      actions={
        <>
          {conge.status === 'pending' && (
            <Button variante="secondaire" chargement={envoi} onClick={annuler}>
              Annuler la demande
            </Button>
          )}
          <Button onClick={onFermer}>Fermer</Button>
        </>
      }
    >
      <div className="modale-ma-demande">
        <Tampon ton={statut.ton}>{statut.libelle}</Tampon>
        <dl className="modale-ma-demande__details">
          <div>
            <dt>Demandé le</dt>
            <dd className="modale-ma-demande__chiffres">{formatDate(conge.created_at)}</dd>
          </div>
          {conge.decided_at && (
            <div>
              <dt>Réponse le</dt>
              <dd className="modale-ma-demande__chiffres">{formatDate(conge.decided_at)}</dd>
            </div>
          )}
          {conge.decision_note && (
            <div>
              <dt>Réponse</dt>
              <dd>« {conge.decision_note} »</dd>
            </div>
          )}
        </dl>
        {echec && (
          <Message ton="erreur" titre="Annulation non enregistrée">
            <p>{echec}</p>
          </Message>
        )}
      </div>
    </Modal>
  )
}
