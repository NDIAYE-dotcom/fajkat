import { useState } from 'react'
import Button from '../../../../components/ui/Button/Button.jsx'
import Field from '../../../../components/ui/Field/Field.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import Modal from '../../../../components/ui/Modal/Modal.jsx'
import Textarea from '../../../../components/ui/Textarea/Textarea.jsx'
import { useToast } from '../../../../hooks/useToast.js'
import { formatDate } from '../../../../lib/format.js'
import { annulerConge, deciderConge } from '../../api.js'
import { libelleTypeConge, nomMembre, periodeConge, STATUTS_CONGE } from '../../utils.js'
import ConflitsGardes from '../ConflitsGardes/ConflitsGardes.jsx'
import './ModaleDecision.css'

// Validation ou refus d'une demande (en attente) ; annulation d'un congé validé
// (retour anticipé, erreur). Les gardes prévues pendant le congé sont rappelées.
export default function ModaleDecision({ orgId, conge, membre, onFermer, onDecide }) {
  const toast = useToast()
  const [note, setNote] = useState('')
  const [envoi, setEnvoi] = useState(null)
  const [echec, setEchec] = useState(null)
  const nom = nomMembre(membre)
  const enAttente = conge.status === 'pending'
  // Refusée ou annulée (ouverte depuis une notification) : consultation seule.
  const terminee = !['pending', 'approved'].includes(conge.status)

  async function executer(quoi, action, succes) {
    setEnvoi(quoi)
    setEchec(null)
    try {
      await action()
      toast.succes(succes)
      onDecide()
    } catch (e) {
      setEchec(e.message)
      setEnvoi(null)
    }
  }

  const actions = terminee ? (
    <Button variante="secondaire" onClick={onFermer}>
      Fermer
    </Button>
  ) : enAttente ? (
    <>
      <Button
        variante="secondaire"
        className="modale-decision__refuser"
        chargement={envoi === 'refus'}
        disabled={Boolean(envoi)}
        onClick={() =>
          executer('refus', () => deciderConge(conge.id, false, note), `Demande de ${nom} refusée`)
        }
      >
        Refuser
      </Button>
      <Button
        chargement={envoi === 'validation'}
        disabled={Boolean(envoi)}
        onClick={() =>
          executer('validation', () => deciderConge(conge.id, true, note), `Congé de ${nom} validé`)
        }
      >
        Valider
      </Button>
    </>
  ) : (
    <>
      <Button variante="secondaire" onClick={onFermer}>
        Fermer
      </Button>
      <Button
        variante="secondaire"
        className="modale-decision__refuser"
        chargement={envoi === 'annulation'}
        onClick={() =>
          executer('annulation', () => annulerConge(conge.id), `Congé de ${nom} annulé`)
        }
      >
        Annuler ce congé
      </Button>
    </>
  )

  return (
    <Modal
      ouvert
      onFermer={onFermer}
      titre={`${libelleTypeConge(conge.leave_type)} — ${nom}`}
      description={periodeConge(conge.start_date, conge.end_date)}
      actions={actions}
    >
      <div className="modale-decision">
        <dl className="modale-decision__details">
          <div>
            <dt>Demandé le</dt>
            <dd className="modale-decision__chiffres">{formatDate(conge.created_at)}</dd>
          </div>
          {conge.leave_type !== 'maladie' && (
            <div>
              <dt>Motif</dt>
              <dd>{conge.reason || 'Aucun motif indiqué'}</dd>
            </div>
          )}
          {!enAttente && conge.decision_note && (
            <div>
              <dt>Réponse</dt>
              <dd>{conge.decision_note}</dd>
            </div>
          )}
        </dl>
        <ConflitsGardes
          orgId={orgId}
          membreId={conge.membership_id}
          debut={conge.start_date}
          fin={conge.end_date}
        />
        {enAttente && (
          <Field
            id="decision-note"
            label="Réponse à la personne"
            facultatif
            aide="Visible par la personne. N’y écrivez aucune information médicale."
          >
            <Textarea
              rows={2}
              maxLength={300}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>
        )}
        {terminee && (
          <Message ton="info" titre="Demande déjà traitée">
            <p>{`Statut : ${STATUTS_CONGE[conge.status].libelle.toLowerCase()}.`}</p>
          </Message>
        )}
        {!enAttente && !terminee && (
          <p className="modale-decision__texte">
            Annuler ce congé le retire du planning. La personne verra « Annulé » dans son espace.
          </p>
        )}
        {echec && (
          <Message ton="erreur" titre="Action non enregistrée">
            <p>{echec}</p>
          </Message>
        )}
      </div>
    </Modal>
  )
}
