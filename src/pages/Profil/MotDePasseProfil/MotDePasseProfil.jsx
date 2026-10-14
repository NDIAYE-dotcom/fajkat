import { useState } from 'react'
import Button from '../../../components/ui/Button/Button.jsx'
import Field from '../../../components/ui/Field/Field.jsx'
import Message from '../../../components/ui/Message/Message.jsx'
import Panel from '../../../components/ui/Panel/Panel.jsx'
import PasswordInput from '../../../components/ui/PasswordInput/PasswordInput.jsx'
import ReglesMotDePasse from '../../../components/ui/ReglesMotDePasse/ReglesMotDePasse.jsx'
import { useToast } from '../../../hooks/useToast.js'
import { estMotDePasseValide, MESSAGE_MOT_DE_PASSE } from '../../../lib/motDePasse.js'
import { changerMonMotDePasse } from '../../../lib/profil.js'
import './MotDePasseProfil.css'

// Changement du mot de passe, après vérification du mot de passe actuel.
export default function MotDePasseProfil({ email }) {
  const toast = useToast()
  const [actuel, setActuel] = useState('')
  const [nouveau, setNouveau] = useState('')
  const [erreurs, setErreurs] = useState({})
  const [envoi, setEnvoi] = useState(false)
  const [echec, setEchec] = useState(null)

  async function surEnvoi(evenement) {
    evenement.preventDefault()
    const trouvees = {}
    if (!actuel) trouvees.actuel = 'Saisissez votre mot de passe actuel.'
    if (!estMotDePasseValide(nouveau)) trouvees.nouveau = MESSAGE_MOT_DE_PASSE
    else if (nouveau === actuel)
      trouvees.nouveau = 'Le nouveau mot de passe doit être différent de l’ancien.'
    setErreurs(trouvees)
    if (trouvees.actuel) return document.getElementById('profil-mdp-actuel')?.focus()
    if (trouvees.nouveau) return document.getElementById('profil-mdp-nouveau')?.focus()
    setEnvoi(true)
    setEchec(null)
    try {
      await changerMonMotDePasse(email, actuel, nouveau)
      setActuel('')
      setNouveau('')
      toast.succes('Mot de passe changé', {
        message: 'Utilisez-le à votre prochaine connexion.',
      })
    } catch (e) {
      if (e.code === 'mot_de_passe_actuel') {
        setErreurs({ actuel: e.message })
        document.getElementById('profil-mdp-actuel')?.focus()
      } else {
        setEchec(e.message)
      }
    } finally {
      setEnvoi(false)
    }
  }

  return (
    <Panel titre="Mot de passe">
      <form className="mot-de-passe-profil" noValidate onSubmit={surEnvoi}>
        {/* Aide les gestionnaires de mots de passe à rattacher le compte. */}
        <input type="hidden" name="username" autoComplete="username" value={email ?? ''} />
        <Field id="profil-mdp-actuel" label="Mot de passe actuel" requis erreur={erreurs.actuel}>
          <PasswordInput
            autoComplete="current-password"
            value={actuel}
            onChange={(e) => setActuel(e.target.value)}
          />
        </Field>
        <Field id="profil-mdp-nouveau" label="Nouveau mot de passe" requis erreur={erreurs.nouveau}>
          <PasswordInput
            autoComplete="new-password"
            aria-describedby="profil-mdp-regles"
            value={nouveau}
            onChange={(e) => setNouveau(e.target.value)}
          />
          <ReglesMotDePasse id="profil-mdp-regles" motDePasse={nouveau} />
        </Field>
        {echec && (
          <Message ton="erreur" titre="Mot de passe inchangé">
            <p>{echec}</p>
          </Message>
        )}
        <div>
          <Button type="submit" chargement={envoi}>
            Changer le mot de passe
          </Button>
        </div>
      </form>
    </Panel>
  )
}
