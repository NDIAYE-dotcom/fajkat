import { useState } from 'react'
import Button from '../../../../components/ui/Button/Button.jsx'
import Field from '../../../../components/ui/Field/Field.jsx'
import Input from '../../../../components/ui/Input/Input.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import PasswordInput from '../../../../components/ui/PasswordInput/PasswordInput.jsx'
import PhoneInput from '../../../../components/ui/PhoneInput/PhoneInput.jsx'
import ReglesMotDePasse from '../../../../components/ui/ReglesMotDePasse/ReglesMotDePasse.jsx'
import { connecter } from '../../../../lib/auth.js'
import {
  estEmailValide,
  estMotDePasseValide,
  MESSAGE_MOT_DE_PASSE,
} from '../../../../lib/motDePasse.js'
import { estTelephoneValide } from '../../../../lib/pays.js'
import { accepterInvitation, creerCompteInvite } from '../../../../modules/personnel/api.js'
import './CreerCompte.css'

function valider(compte, mode) {
  const e = {}
  if (mode === 'creer') {
    if (compte.nomComplet.trim().length < 2) e.nomComplet = 'Saisissez votre prénom et votre nom.'
    if (compte.telephone && !estTelephoneValide(compte.telephone))
      e.telephone = 'Numéro incomplet : vérifiez le nombre de chiffres.'
  }
  if (!estEmailValide(compte.email)) e.email = 'Saisissez une adresse e-mail valide.'
  if (mode === 'creer' && !estMotDePasseValide(compte.motDePasse))
    e.motDePasse = MESSAGE_MOT_DE_PASSE
  if (mode === 'connexion' && !compte.motDePasse) e.motDePasse = 'Saisissez votre mot de passe.'
  return e
}

// Visiteur non connecté : créer son compte (cas le plus courant) ou se connecter à un
// compte existant. Dans les deux cas, la structure est rejointe dans la foulée.
export default function CreerCompte({
  jeton,
  invitation,
  onConnexion,
  onRejoint,
  onEchecApresConnexion,
}) {
  const [mode, setMode] = useState('creer')
  const [compte, setCompte] = useState({
    nomComplet: invitation.full_name ?? '',
    telephone: '',
    email: invitation.email ?? '',
    motDePasse: '',
  })
  const [erreurs, setErreurs] = useState({})
  const [envoi, setEnvoi] = useState(false)
  const [echec, setEchec] = useState(null)
  const [compteExistant, setCompteExistant] = useState(false)
  const [compteCree, setCompteCree] = useState(false)

  const champ = (nom) => (valeur) => setCompte((c) => ({ ...c, [nom]: valeur }))

  function changerMode(suivant) {
    setMode(suivant)
    setErreurs({})
    setEchec(null)
    setCompte((c) => ({ ...c, motDePasse: '' }))
  }

  async function surEnvoi(evenement) {
    evenement.preventDefault()
    const trouvees = valider(compte, mode)
    setErreurs(trouvees)
    const premiere = ['nomComplet', 'telephone', 'email', 'motDePasse'].find((c) => trouvees[c])
    if (premiere) return document.getElementById(`inv-${premiere}`)?.focus()

    setEnvoi(true)
    setEchec(null)
    try {
      if (mode === 'creer') {
        let resultat
        try {
          resultat = await creerCompteInvite(jeton, compte)
        } catch (erreur) {
          if (erreur.code !== 'compte_existant') throw erreur
          // Rien n'a été créé ni modifié : la personne se connecte avec son compte
          // (la saisie est gardée).
          setCompteExistant(true)
          setMode('connexion')
          setEnvoi(false)
          return
        }
        onConnexion(true)
        try {
          await connecter(compte.email.trim(), compte.motDePasse)
        } catch {
          // Compte créé et structure rejointe : seule la connexion reste à faire.
          onConnexion(false)
          setCompteCree(true)
          setMode('connexion')
          setEnvoi(false)
          return
        }
        onRejoint(resultat.org_id)
        return
      }

      onConnexion(true)
      await connecter(compte.email.trim(), compte.motDePasse)
      try {
        onRejoint(await accepterInvitation(jeton))
      } catch (erreur) {
        // Connecté, mais pas encore membre : l'écran « Rejoindre » prend le relais.
        onEchecApresConnexion(erreur)
        onConnexion(false)
      }
    } catch (erreur) {
      onConnexion(false)
      setEchec(erreur)
      setEnvoi(false)
    }
  }

  const creer = mode === 'creer'
  return (
    <form className="creer-compte" noValidate onSubmit={surEnvoi}>
      {compteCree && (
        <Message ton="succes" titre="Compte créé">
          <p>
            Votre compte est créé et vous faites partie de l’équipe. Connectez-vous pour continuer.
          </p>
        </Message>
      )}
      {compteExistant && (
        <Message titre="Vous avez déjà un compte">
          <p>Cette adresse a déjà un compte : connectez-vous pour rejoindre la structure.</p>
        </Message>
      )}
      {echec && (
        <Message ton="erreur" titre={creer ? 'Compte non créé' : 'Connexion refusée'}>
          <p>{echec.message}</p>
        </Message>
      )}

      {creer && (
        <>
          <Field id="inv-nomComplet" label="Prénom et nom" requis erreur={erreurs.nomComplet}>
            <Input
              autoComplete="name"
              value={compte.nomComplet}
              onChange={(e) => champ('nomComplet')(e.target.value)}
            />
          </Field>
          <Field
            id="inv-telephone"
            label="Téléphone"
            facultatif
            aide="Pour que l’équipe puisse vous joindre."
            erreur={erreurs.telephone}
          >
            <PhoneInput value={compte.telephone} onChange={champ('telephone')} />
          </Field>
        </>
      )}

      <Field
        id="inv-email"
        label="Adresse e-mail"
        requis
        aide={creer ? 'Elle vous servira à vous connecter.' : undefined}
        erreur={erreurs.email}
      >
        <Input
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          value={compte.email}
          onChange={(e) => champ('email')(e.target.value)}
        />
      </Field>

      <Field id="inv-motDePasse" label="Mot de passe" requis erreur={erreurs.motDePasse}>
        <PasswordInput
          autoComplete={creer ? 'new-password' : 'current-password'}
          aria-describedby={creer ? 'inv-regles' : undefined}
          value={compte.motDePasse}
          onChange={(e) => champ('motDePasse')(e.target.value)}
        />
        {creer && <ReglesMotDePasse id="inv-regles" motDePasse={compte.motDePasse} />}
      </Field>

      <Button type="submit" taille="grande" chargement={envoi}>
        {creer ? 'Créer mon compte et rejoindre' : 'Me connecter et rejoindre'}
      </Button>

      <p className="creer-compte__bascule">
        {creer ? 'Vous avez déjà un compte Fajkat ?' : 'Pas encore de compte ?'}{' '}
        <Button variante="discret" onClick={() => changerMode(creer ? 'connexion' : 'creer')}>
          {creer ? 'Me connecter' : 'Créer mon compte'}
        </Button>
      </p>
    </form>
  )
}
