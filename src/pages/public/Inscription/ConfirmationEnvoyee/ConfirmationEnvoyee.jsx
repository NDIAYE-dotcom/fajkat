import { MailCheck } from 'lucide-react'
import { useState } from 'react'
import Button from '../../../../components/ui/Button/Button.jsx'
import Icone from '../../../../components/ui/Icone/Icone.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import { renvoyerConfirmation } from '../../../../lib/auth.js'
import './ConfirmationEnvoyee.css'

// Après l'inscription, quand l'adresse e-mail doit être confirmée.
// La structure est déjà enregistrée avec le compte : rien à ressaisir.
export default function ConfirmationEnvoyee({ email, nomStructure }) {
  const [renvoi, setRenvoi] = useState({ etat: 'repos', message: null })

  async function surRenvoi() {
    setRenvoi({ etat: 'envoi', message: null })
    try {
      await renvoyerConfirmation(email)
      setRenvoi({ etat: 'fait', message: 'Un nouvel e-mail vient de partir.' })
    } catch (erreur) {
      setRenvoi({ etat: 'erreur', message: erreur.message })
    }
  }

  return (
    <div className="confirmation-envoyee">
      <p className="confirmation-envoyee__icone" aria-hidden="true">
        <Icone icone={MailCheck} taille={28} />
      </p>
      <p>
        Nous avons envoyé un lien à <strong className="confirmation-envoyee__email">{email}</strong>
        . Ouvrez-le pour activer votre compte, sur cet appareil ou sur votre téléphone.
      </p>
      <p>
        <strong>{nomStructure}</strong> sera créée automatiquement à votre première connexion. Vous
        n’aurez rien à ressaisir.
      </p>
      <p className="confirmation-envoyee__aide">
        Rien reçu après quelques minutes ? Regardez dans les courriers indésirables (spam).
      </p>

      {renvoi.message && (
        <Message ton={renvoi.etat === 'erreur' ? 'erreur' : 'succes'}>{renvoi.message}</Message>
      )}

      <div className="confirmation-envoyee__actions">
        <Button to="/connexion" state={{ email }}>
          J’ai confirmé, me connecter
        </Button>
        <Button variante="secondaire" chargement={renvoi.etat === 'envoi'} onClick={surRenvoi}>
          Renvoyer l’e-mail
        </Button>
      </div>
    </div>
  )
}
