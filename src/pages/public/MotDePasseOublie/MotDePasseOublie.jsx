import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import AuthPage from '../../../components/layout/AuthPage/AuthPage.jsx'
import Button from '../../../components/ui/Button/Button.jsx'
import Field from '../../../components/ui/Field/Field.jsx'
import Input from '../../../components/ui/Input/Input.jsx'
import Message from '../../../components/ui/Message/Message.jsx'
import { demanderReinitialisation } from '../../../lib/auth.js'
import { estEmailValide } from '../../../lib/motDePasse.js'
import './MotDePasseOublie.css'

export default function MotDePasseOublie() {
  const { state } = useLocation()
  const [email, setEmail] = useState(state?.email ?? '')
  const [erreur, setErreur] = useState(null)
  const [echec, setEchec] = useState(null)
  const [envoi, setEnvoi] = useState(false)
  const [envoye, setEnvoye] = useState(false)

  async function surEnvoi(evenement) {
    evenement.preventDefault()
    if (!estEmailValide(email)) {
      setErreur('Saisissez l’adresse e-mail de votre compte.')
      return document.getElementById('mdp-email')?.focus()
    }
    setErreur(null)
    setEchec(null)
    setEnvoi(true)
    try {
      await demanderReinitialisation(email.trim())
      setEnvoye(true)
    } catch (e) {
      setEchec(e.message)
    } finally {
      setEnvoi(false)
    }
  }

  return (
    <AuthPage
      titre="Mot de passe oublié"
      intro="Recevez par e-mail un lien pour choisir un nouveau mot de passe."
      pied={
        <p>
          <Link to="/connexion">Revenir à la connexion</Link>
        </p>
      }
    >
      {envoye ? (
        <Message ton="succes" titre="E-mail envoyé">
          <p>
            Si un compte existe pour {email.trim()}, un lien vient d’y être envoyé. Il est valable
            une heure. Pensez à regarder dans les courriers indésirables (spam).
          </p>
        </Message>
      ) : (
        <form className="mot-de-passe-oublie" noValidate onSubmit={surEnvoi}>
          {echec && (
            <Message ton="erreur" titre="E-mail non envoyé">
              {echec}
            </Message>
          )}
          <Field id="mdp-email" label="Adresse e-mail du compte" requis erreur={erreur}>
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
          <div>
            <Button type="submit" taille="grande" chargement={envoi}>
              Recevoir le lien
            </Button>
          </div>
        </form>
      )}
    </AuthPage>
  )
}
