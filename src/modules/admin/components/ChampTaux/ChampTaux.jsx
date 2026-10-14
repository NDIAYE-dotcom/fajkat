import Field from '../../../../components/ui/Field/Field.jsx'
import Input from '../../../../components/ui/Input/Input.jsx'
import './ChampTaux.css'

// Taux de prise en charge par défaut, en pourcentage entier. Vide tant que la structure
// ne l'a pas saisi : aucune valeur n'est supposée. value : nombre ou null.
export default function ChampTaux({ id, nom, value, erreur, onChange }) {
  function surSaisie(evenement) {
    const chiffres = evenement.target.value.replace(/\D/g, '').slice(0, 3)
    onChange(chiffres === '' ? null : Number(chiffres))
  }

  return (
    <Field
      id={id}
      className="champ-taux"
      label={
        <>
          Prise en charge<span className="sr-only"> : {nom}</span>
        </>
      }
      aide="Selon votre convention avec cet organisme."
      erreur={erreur}
    >
      <Input
        mono
        inputMode="numeric"
        autoComplete="off"
        placeholder="À saisir"
        value={value ?? ''}
        onChange={surSaisie}
        suffixe={<span className="champ-taux__unite">%</span>}
      />
    </Field>
  )
}
