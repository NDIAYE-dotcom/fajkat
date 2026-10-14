import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import Button from '../../../../components/ui/Button/Button.jsx'
import Field from '../../../../components/ui/Field/Field.jsx'
import Input from '../../../../components/ui/Input/Input.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import PasswordInput from '../../../../components/ui/PasswordInput/PasswordInput.jsx'
import { connecter, renvoyerConfirmation } from '../../../../lib/auth.js'
import { estEmailValide } from '../../../../lib/motDePasse.js'
import './FormulaireEmail.css'

// Connexion par e-mail et mot de passe. En cas de succès, la session change et la page
// Connexion redirige d'elle-même vers l'application.
export default function FormulaireEmail() {
  const { state } = useLocation()
  const [email, setEmail] = useState(state?.email ?? '')
  const [motDePasse, setMotDePasse] = useState('')
  const [erreurs, setErreurs] = useState({})
  const [envoi, setEnvoi] = useState(false)
  const [echec, setEchec] = useState(null)
  const [renvoi, setRenvoi] = useState({ etat: 'repos', message: null })

  async function surEnvoi(evenement) {
    evenement.preventDefault()
    const trouvees = {}
    if (!estEmailValide(email)) trouvees.email = 'Saisissez une adresse e-mail valide.'
    if (!motDePasse) trouvees.motDePasse = 'Saisissez votre mot de passe.'
    setErreurs(trouvees)
    if (trouvees.email) return document.getElementById('cx-email')?.focus()
    if (trouvees.motDePasse) return document.getElementById('cx-mot-de-passe')?.focus()

    setEnvoi(true)
    setEchec(null)
    setRenvoi({ etat: 'repos', message: null })
    try {
      await connecter(email.trim(), motDePasse)
    } catch (erreur) {
      setEchec(erreur)
      setEnvoi(false)
    }
  }

  async function surRenvoi() {
    setRenvoi({ etat: 'envoi', message: null })
    try {
      await renvoyerConfirmation(email.trim())
      setRenvoi({ etat: 'fait', message: `Un nouvel e-mail a été envoyé à ${email.trim()}.` })
    } catch (erreur) {
      setRenvoi({ etat: 'repos', message: erreur.message })
    }
  }

  const nonConfirme = echec?.code === 'email_not_confirmed'

  return (
    <form className="formulaire-email" noValidate onSubmit={surEnvoi}>
      {echec && (
        <Message
          ton={nonConfirme ? 'info' : 'erreur'}
          titre={nonConfirme ? 'Adresse e-mail à confirmer' : 'Connexion refusée'}
          action={
            nonConfirme &&
            renvoi.etat !== 'fait' && (
              <Button
                variante="secondaire"
                chargement={renvoi.etat === 'envoi'}
                onClick={surRenvoi}
              >
                Renvoyer l’e-mail de confirmation
              </Button>
            )
          }
        >
          <p>{echec.message}</p>
          {renvoi.message && <p>{renvoi.message}</p>}
        </Message>
      )}

      <Field id="cx-email" label="Adresse e-mail" requis erreur={erreurs.email}>
        <Input
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </Field>

      <Field id="cx-mot-de-passe" label="Mot de passe" requis erreur={erreurs.motDePasse}>
        <PasswordInput value={motDePasse} onChange={(e) => setMotDePasse(e.target.value)} />
      </Field>

      <Button type="submit" taille="grande" chargement={envoi}>
        Se connecter
      </Button>
    </form>
  )
}
