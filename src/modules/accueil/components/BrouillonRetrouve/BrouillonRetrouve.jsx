import Button from '../../../../components/ui/Button/Button.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import { formatHeure } from '../../../../lib/format.js'

// Saisie retrouvée après une coupure ou une fermeture : on peut repartir de zéro.
export default function BrouillonRetrouve({ brouillon, onEffacer }) {
  if (!brouillon.restaure || !brouillon.enregistreLe) return null
  return (
    <Message ton="info">
      <p>Votre saisie de {formatHeure(brouillon.enregistreLe)} a été retrouvée.</p>
      <Button
        variante="discret"
        onClick={() => {
          brouillon.effacer()
          onEffacer?.()
        }}
      >
        Effacer la saisie
      </Button>
    </Message>
  )
}
