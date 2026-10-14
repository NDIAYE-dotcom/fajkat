import { useState } from 'react'
import Button from '../../../../components/ui/Button/Button.jsx'
import Field from '../../../../components/ui/Field/Field.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import PasswordInput from '../../../../components/ui/PasswordInput/PasswordInput.jsx'
import ReglesMotDePasse from '../../../../components/ui/ReglesMotDePasse/ReglesMotDePasse.jsx'
import { useAuth } from '../../../../hooks/useAuth.js'
import { definirMotDePasseInvite } from '../../../../lib/auth.js'
import { estMotDePasseValide, MESSAGE_MOT_DE_PASSE } from '../../../../lib/motDePasse.js'
import { accepterInvitation } from '../../../../modules/personnel/api.js'
import './RejoindreConnecte.css'

// Personne déjà connectée : elle rejoint la structure d'un clic. Arrivée par une
// invitation e-mail (compte créé par Supabase, sans mot de passe) : elle choisit d'abord
// son mot de passe, pour pouvoir se reconnecter ensuite.
export default function RejoindreConnecte({ jeton, structure, erreurInitiale, onRejoint }) {
  const { utilisateur, deconnecter } = useAuth()
  const sansMotDePasse = Boolean(utilisateur?.user_metadata?.invitation_sans_mot_de_passe)
  const [motDePasse, setMotDePasse] = useState('')
  const [erreurChamp, setErreurChamp] = useState(null)
  const [envoi, setEnvoi] = useState(false)
  const [echec, setEchec] = useState(erreurInitiale)

  async function rejoindre(evenement) {
    evenement.preventDefault()
    if (sansMotDePasse && !estMotDePasseValide(motDePasse)) {
      setErreurChamp(MESSAGE_MOT_DE_PASSE)
      return document.getElementById('rej-motDePasse')?.focus()
    }
    setErreurChamp(null)
    setEnvoi(true)
    setEchec(null)
    try {
      if (sansMotDePasse) await definirMotDePasseInvite(motDePasse)
      onRejoint(await accepterInvitation(jeton))
    } catch (erreur) {
      setEchec(erreur)
      setEnvoi(false)
    }
  }

  return (
    <form className="rejoindre-connecte" noValidate onSubmit={rejoindre}>
      <p className="rejoindre-connecte__compte">
        Connecté avec <strong>{utilisateur?.email}</strong>.
      </p>

      {echec && (
        <Message ton="erreur" titre="Vous n’avez pas encore rejoint la structure">
          <p>{echec.message}</p>
        </Message>
      )}

      {sansMotDePasse && (
        <Field
          id="rej-motDePasse"
          label="Choisissez votre mot de passe"
          requis
          erreur={erreurChamp}
        >
          <PasswordInput
            autoComplete="new-password"
            aria-describedby="rej-regles"
            value={motDePasse}
            onChange={(e) => setMotDePasse(e.target.value)}
          />
          <ReglesMotDePasse id="rej-regles" motDePasse={motDePasse} />
        </Field>
      )}

      <Button type="submit" taille="grande" chargement={envoi}>
        Rejoindre {structure}
      </Button>

      <p className="rejoindre-connecte__autre">
        Ce n’est pas votre compte ?{' '}
        <Button variante="discret" disabled={envoi} onClick={() => deconnecter()}>
          Me déconnecter
        </Button>
      </p>
    </form>
  )
}
