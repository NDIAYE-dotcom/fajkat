import { useState } from 'react'
import Button from '../../../../components/ui/Button/Button.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import Modal from '../../../../components/ui/Modal/Modal.jsx'

// Validation : une consultation validée ne se modifie plus ; les corrections passent par
// un avenant daté. Les maladies à déclaration immédiate sont rappelées.
export default function ModaleValidation({ ouvert, onFermer, declarations, enLigne, onValider }) {
  const [envoi, setEnvoi] = useState(false)
  const [echec, setEchec] = useState(null)

  async function valider() {
    setEnvoi(true)
    setEchec(null)
    try {
      await onValider()
    } catch (e) {
      setEchec(e.message)
      setEnvoi(false)
    }
  }

  return (
    <Modal
      ouvert={ouvert}
      onFermer={onFermer}
      titre="Valider la consultation ?"
      actions={
        <>
          <Button variante="discret" onClick={onFermer}>
            Continuer la saisie
          </Button>
          <Button chargement={envoi} disabled={!enLigne} onClick={valider}>
            Valider la consultation
          </Button>
        </>
      }
    >
      <p>
        Une fois validée, la consultation ne se modifie plus. Une correction se fera par un avenant
        daté, signé de votre nom.
      </p>
      {declarations.length > 0 && (
        <p>{`La validation déclenche l’alerte de déclaration immédiate : ${declarations.join(', ')}.`}</p>
      )}
      {!enLigne && (
        <Message ton="info">
          <p>
            Pas de connexion : la validation attendra le retour du réseau. Votre saisie est gardée.
          </p>
        </Message>
      )}
      {echec && (
        <Message ton="erreur">
          <p>{echec}</p>
        </Message>
      )}
    </Modal>
  )
}
