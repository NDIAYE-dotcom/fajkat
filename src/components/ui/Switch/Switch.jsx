import { useChamp } from '../Field/useChamp.js'
import './Switch.css'

// Interrupteur pour un réglage pris en compte immédiatement (ex. « Rappels WhatsApp activés »).
// Case native avec role="switch" : annoncée « activé / désactivé » par les lecteurs d'écran.
export default function Switch({ label, description, className = '', ref, ...props }) {
  const { invalide: _invalide, ...attributs } = useChamp(props)
  const classes = ['switch', attributs.disabled && 'switch--desactive', className]
    .filter(Boolean)
    .join(' ')

  return (
    <label className={classes}>
      <span className="switch__texte">
        <span className="switch__libelle">{label}</span>
        {description && <span className="switch__description">{description}</span>}
      </span>
      <input ref={ref} type="checkbox" role="switch" className="switch__champ" {...attributs} />
      <span className="switch__piste" aria-hidden="true">
        <span className="switch__curseur" />
      </span>
    </label>
  )
}
