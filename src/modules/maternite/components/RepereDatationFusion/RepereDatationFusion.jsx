import { useState } from 'react'
import Button from '../../../../components/ui/Button/Button.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import { useEnLigne } from '../../../../hooks/useEnLigne.js'
import { formatDate } from '../../../../lib/format.js'
import { confirmerDatation } from '../../api.js'

// « Datation à vérifier (fusion) » : deux dossiers fusionnés suivaient la même grossesse
// avec des DDR différentes. La datation gardée reste ; l'autre est dans l'historique.
// Soignants habilités seulement (la base n'envoie le repère qu'à eux).
export default function RepereDatationFusion({ grossesse, onVerifiee }) {
  const enLigne = useEnLigne()
  const [envoi, setEnvoi] = useState(false)
  const [echec, setEchec] = useState(null)

  async function verifier() {
    setEnvoi(true)
    setEchec(null)
    try {
      await confirmerDatation(grossesse.id)
      await onVerifiee()
    } catch (e) {
      setEchec(e.message)
    } finally {
      setEnvoi(false)
    }
  }

  return (
    <Message
      ton="info"
      titre="Datation à vérifier (fusion)"
      action={
        <Button chargement={envoi} disabled={!enLigne} onClick={verifier}>
          J’ai vérifié la datation
        </Button>
      }
    >
      <p>
        Deux dossiers fusionnés le {formatDate(grossesse.dating_review_since)} suivaient cette
        grossesse avec des dates de dernières règles différentes. La datation retenue est gardée ;
        l’autre est dans l’historique des datations. Retenez la bonne, puis confirmez.
      </p>
      {echec && <p role="alert">{echec}</p>}
    </Message>
  )
}
