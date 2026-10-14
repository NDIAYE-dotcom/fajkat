import { Trash2 } from 'lucide-react'
import Button from '../../../../components/ui/Button/Button.jsx'
import Field from '../../../../components/ui/Field/Field.jsx'
import Icone from '../../../../components/ui/Icone/Icone.jsx'
import Input from '../../../../components/ui/Input/Input.jsx'
import PhoneInput from '../../../../components/ui/PhoneInput/PhoneInput.jsx'
import Select from '../../../../components/ui/Select/Select.jsx'
import './LigneMembre.css'

// Une personne de l'équipe : nom, rôle, et au moins un moyen de la joindre.
// erreurs : { full_name, role, contact, phone, email }.
export default function LigneMembre({ ligne, numero, roles, erreurs = {}, onChange, onRetirer }) {
  const id = (champ) => `membre-${ligne.id}-${champ}`
  const nom = ligne.full_name.trim() || `Personne ${numero}`

  return (
    <li className="ligne-membre">
      <div className="ligne-membre__grille">
        <Field id={id('full_name')} label="Prénom et nom" requis erreur={erreurs.full_name}>
          <Input
            autoComplete="off"
            value={ligne.full_name}
            onChange={(e) => onChange('full_name', e.target.value)}
          />
        </Field>
        <Field id={id('role')} label="Rôle" requis erreur={erreurs.role}>
          <Select
            placeholder="Choisir un rôle"
            options={roles}
            value={ligne.role}
            onChange={(e) => onChange('role', e.target.value)}
          />
        </Field>
        <Field id={id('phone')} label="Téléphone" erreur={erreurs.phone ?? erreurs.contact}>
          <PhoneInput value={ligne.phone} onChange={(valeur) => onChange('phone', valeur)} />
        </Field>
        <Field id={id('email')} label="E-mail" erreur={erreurs.email}>
          <Input
            type="email"
            inputMode="email"
            autoComplete="off"
            value={ligne.email}
            onChange={(e) => onChange('email', e.target.value)}
          />
        </Field>
      </div>
      <Button
        variante="discret"
        className="ligne-membre__retirer"
        iconeDebut={<Icone icone={Trash2} />}
        onClick={onRetirer}
        aria-label={`Retirer ${nom}`}
      >
        Retirer
      </Button>
    </li>
  )
}
