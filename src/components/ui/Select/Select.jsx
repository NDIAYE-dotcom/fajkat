import { ChevronDown } from 'lucide-react'
import { useChamp } from '../Field/useChamp.js'
import Icone from '../Icone/Icone.jsx'
import '../Input/Input.css'
import './Select.css'

// Liste déroulante native : la plus fiable sur les téléphones Android d'entrée de gamme.
// options : [{ valeur, libelle, desactive? }] ; ou des <option> en enfants.
export default function Select({ options, placeholder, className = '', ref, children, ...props }) {
  const { invalide, ...attributs } = useChamp(props)
  const classes = [
    'input',
    'select',
    invalide && 'input--erreur',
    attributs.disabled && 'input--desactive',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={classes}>
      <select ref={ref} className="input__champ select__champ" {...attributs}>
        {placeholder && (
          <option value="" disabled={attributs.required}>
            {placeholder}
          </option>
        )}
        {options?.map((option) => (
          <option key={option.valeur} value={option.valeur} disabled={option.desactive}>
            {option.libelle}
          </option>
        ))}
        {children}
      </select>
      <Icone icone={ChevronDown} className="select__chevron" />
    </div>
  )
}
