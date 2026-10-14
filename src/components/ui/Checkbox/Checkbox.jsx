import { Check } from 'lucide-react'
import { useChamp } from '../Field/useChamp.js'
import Icone from '../Icone/Icone.jsx'
import './Checkbox.css'

// Case à cocher : la case native reste dans le DOM (clavier, lecteurs d'écran, formulaires),
// seule son apparence est redessinée. Toute la ligne est cliquable (44 px de haut minimum).
export default function Checkbox({ label, description, className = '', ref, ...props }) {
  const { invalide, ...attributs } = useChamp(props)
  const classes = [
    'checkbox',
    invalide && 'checkbox--erreur',
    attributs.disabled && 'checkbox--desactive',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <label className={classes}>
      <input ref={ref} type="checkbox" className="checkbox__champ" {...attributs} />
      <span className="checkbox__case" aria-hidden="true">
        <Icone icone={Check} className="checkbox__coche" taille={16} epaisseur={3} />
      </span>
      <span className="checkbox__texte">
        <span className="checkbox__libelle">{label}</span>
        {description && <span className="checkbox__description">{description}</span>}
      </span>
    </label>
  )
}
