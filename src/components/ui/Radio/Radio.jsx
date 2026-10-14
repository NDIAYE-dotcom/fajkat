import { useChamp } from '../Field/useChamp.js'
import '../Checkbox/Checkbox.css'
import './Radio.css'

// Bouton radio : même mise en page que Checkbox, case ronde.
// À placer dans un <Field groupe> (fieldset + legend) avec le même « name ».
export default function Radio({ label, description, className = '', ref, ...props }) {
  // data-etat : état figé (survol, focus) pour la page /atelier, porté par l'enveloppe.
  const { 'data-etat': etat, ...reste } = props
  const { invalide, ...attributs } = useChamp(reste)
  const classes = [
    'checkbox',
    'radio',
    invalide && 'checkbox--erreur',
    attributs.disabled && 'checkbox--desactive',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <label className={classes} data-etat={etat}>
      <input ref={ref} type="radio" className="checkbox__champ" {...attributs} />
      <span className="checkbox__case radio__case" aria-hidden="true">
        <span className="radio__point" />
      </span>
      <span className="checkbox__texte">
        <span className="checkbox__libelle">{label}</span>
        {description && <span className="checkbox__description">{description}</span>}
      </span>
    </label>
  )
}
