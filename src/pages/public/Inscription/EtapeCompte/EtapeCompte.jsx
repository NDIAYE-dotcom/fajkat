import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import Button from '../../../../components/ui/Button/Button.jsx'
import Field from '../../../../components/ui/Field/Field.jsx'
import Icone from '../../../../components/ui/Icone/Icone.jsx'
import Input from '../../../../components/ui/Input/Input.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import PasswordInput from '../../../../components/ui/PasswordInput/PasswordInput.jsx'
import PhoneInput from '../../../../components/ui/PhoneInput/PhoneInput.jsx'
import ReglesMotDePasse from '../../../../components/ui/ReglesMotDePasse/ReglesMotDePasse.jsx'
import './EtapeCompte.css'

// Étape 1 : la personne qui inscrit la structure (elle en sera owner).
// Aucun appel réseau ici : le compte est créé à la fin de l'étape 2, avec la structure.
export default function EtapeCompte({
  compte,
  motDePasse,
  erreurs,
  compteExistant,
  onChange,
  onMotDePasse,
  onSuivant,
}) {
  const texte = (champ) => (evenement) => onChange(champ, evenement.target.value)

  return (
    <form className="etape-compte" noValidate onSubmit={onSuivant}>
      {compteExistant && (
        <Message ton="erreur" titre="Cette adresse e-mail a déjà un compte">
          <p>
            <Link to="/connexion" state={{ email: compte.email }}>
              Connectez-vous
            </Link>{' '}
            avec cette adresse, ou saisissez-en une autre.
          </p>
        </Message>
      )}

      <Field
        id="ins-nomComplet"
        label="Nom complet"
        aide="Tel qu’il apparaîtra sur les ordonnances et les reçus."
        requis
        erreur={erreurs.nomComplet}
      >
        <Input autoComplete="name" value={compte.nomComplet} onChange={texte('nomComplet')} />
      </Field>

      <Field
        id="ins-telephone"
        label="Téléphone"
        aide="Pour vous joindre en cas de besoin. Il n’est pas montré aux patients."
        requis
        erreur={erreurs.telephone}
      >
        <PhoneInput value={compte.telephone} onChange={(valeur) => onChange('telephone', valeur)} />
      </Field>

      <Field
        id="ins-email"
        label="Adresse e-mail"
        aide="Elle sert à vous connecter. Un lien de confirmation y sera envoyé."
        requis
        erreur={erreurs.email}
      >
        <Input
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          value={compte.email}
          onChange={texte('email')}
        />
      </Field>

      <Field id="ins-motDePasse" label="Mot de passe" requis erreur={erreurs.motDePasse}>
        <PasswordInput
          autoComplete="new-password"
          aria-describedby="ins-regles"
          value={motDePasse}
          onChange={(evenement) => onMotDePasse(evenement.target.value)}
        />
        <ReglesMotDePasse id="ins-regles" motDePasse={motDePasse} />
      </Field>

      <div className="etape-compte__actions">
        <Button type="submit" taille="grande" iconeFin={<Icone icone={ArrowRight} />}>
          Continuer
        </Button>
      </div>
    </form>
  )
}
