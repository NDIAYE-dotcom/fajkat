import { useChamp } from '../Field/useChamp.js'
import './Input.css'

// Champ texte. La boîte .input (bordure, focus, erreur, désactivé) est partagée par
// Textarea, Select, PhoneInput, MoneyInput et DateInput.
// prefixe / suffixe : texte court ou icône dans la boîte (« FCFA », loupe…).
export default function Input({
  prefixe,
  suffixe,
  mono = false,
  className = '',
  ref,
  type = 'text',
  ...props
}) {
  // data-etat : état figé (survol, focus) pour la page /atelier, porté par l'enveloppe.
  const { 'data-etat': etat, ...reste } = props
  const { invalide, ...attributs } = useChamp(reste)
  const classes = [
    'input',
    invalide && 'input--erreur',
    attributs.disabled && 'input--desactive',
    attributs.readOnly && 'input--lecture',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={classes} data-etat={etat}>
      {prefixe && <span className="input__affixe">{prefixe}</span>}
      <input
        ref={ref}
        type={type}
        className={`input__champ${mono ? ' input__champ--mono' : ''}`}
        {...attributs}
      />
      {suffixe && <span className="input__affixe">{suffixe}</span>}
    </div>
  )
}
