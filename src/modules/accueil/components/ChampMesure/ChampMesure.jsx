import Field from '../../../../components/ui/Field/Field.jsx'
import Input from '../../../../components/ui/Input/Input.jsx'

// Champ numérique d'une constante : clavier numérique sur téléphone (avec la virgule pour
// les décimales), unité affichée dans la boîte.
export default function ChampMesure({ mesure, label, valeur, erreur, onChange, onBlur }) {
  return (
    <Field label={label ?? mesure.libelle} aide={mesure.aide} erreur={erreur}>
      <Input
        name={mesure.cle}
        inputMode={mesure.decimal ? 'decimal' : 'numeric'}
        autoComplete="off"
        enterKeyHint="next"
        suffixe={mesure.unite}
        value={valeur}
        onChange={(e) => onChange(mesure.cle, e.target.value)}
        onBlur={onBlur}
      />
    </Field>
  )
}
