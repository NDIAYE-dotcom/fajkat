import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AuthPage from '../../../components/layout/AuthPage/AuthPage.jsx'
import EcranAttente from '../../../components/layout/EcranAttente/EcranAttente.jsx'
import Button from '../../../components/ui/Button/Button.jsx'
import Field from '../../../components/ui/Field/Field.jsx'
import Message from '../../../components/ui/Message/Message.jsx'
import PasswordInput from '../../../components/ui/PasswordInput/PasswordInput.jsx'
import ReglesMotDePasse from '../../../components/ui/ReglesMotDePasse/ReglesMotDePasse.jsx'
import { useAuth } from '../../../hooks/useAuth.js'
import { useToast } from '../../../hooks/useToast.js'
import { changerMotDePasse } from '../../../lib/auth.js'
import { estMotDePasseValide, MESSAGE_MOT_DE_PASSE } from '../../../lib/motDePasse.js'
import './Reinitialiser.css'

// Arrivée par le lien « mot de passe oublié » : Supabase a ouvert une session de récupération.
export default function Reinitialiser() {
  const { session, initialise, recuperation, finRecuperation } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [motDePasse, setMotDePasse] = useState('')
  const [erreur, setErreur] = useState(null)
  const [echec, setEchec] = useState(null)
  const [envoi, setEnvoi] = useState(false)

  if (!initialise) return <EcranAttente integre libelle="Vérification du lien…" />

  // Sans lien valable (expiré, déjà utilisé, ou page ouverte directement).
  if (!session || !recuperation) {
    return (
      <AuthPage titre="Lien expiré ou invalide">
        <Message ton="erreur" titre="Ce lien ne permet plus de changer le mot de passe">
          <p>Il a expiré (au bout d’une heure) ou a déjà servi. Demandez-en un nouveau.</p>
        </Message>
        <div>
          <Button to="/mot-de-passe-oublie">Recevoir un nouveau lien</Button>
        </div>
      </AuthPage>
    )
  }

  async function surEnvoi(evenement) {
    evenement.preventDefault()
    if (!estMotDePasseValide(motDePasse)) {
      setErreur(MESSAGE_MOT_DE_PASSE)
      return document.getElementById('reinit-mot-de-passe')?.focus()
    }
    setErreur(null)
    setEchec(null)
    setEnvoi(true)
    try {
      await changerMotDePasse(motDePasse)
      finRecuperation()
      toast.succes('Mot de passe changé', { message: 'Vous êtes connecté(e).' })
      navigate('/app', { replace: true })
    } catch (e) {
      setEchec(e.message)
      setEnvoi(false)
    }
  }

  return (
    <AuthPage
      titre="Nouveau mot de passe"
      intro="Choisissez un mot de passe que vous n’utilisez pas ailleurs."
      pied={
        <p>
          <Link to="/connexion">Revenir à la connexion</Link>
        </p>
      }
    >
      <form className="reinitialiser" noValidate onSubmit={surEnvoi}>
        {echec && (
          <Message ton="erreur" titre="Mot de passe inchangé">
            {echec}
          </Message>
        )}
        <Field id="reinit-mot-de-passe" label="Nouveau mot de passe" requis erreur={erreur}>
          <PasswordInput
            autoComplete="new-password"
            aria-describedby="reinit-regles"
            value={motDePasse}
            onChange={(e) => setMotDePasse(e.target.value)}
          />
          <ReglesMotDePasse id="reinit-regles" motDePasse={motDePasse} />
        </Field>
        <div>
          <Button type="submit" taille="grande" chargement={envoi}>
            Enregistrer le mot de passe
          </Button>
        </div>
      </form>
    </AuthPage>
  )
}
