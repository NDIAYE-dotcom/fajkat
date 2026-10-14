import { useChamp } from '../Field/useChamp.js'
import '../Input/Input.css'
import './Textarea.css'

// Zone de texte (motif de consultation, observations). Avec maxLength, un compteur s'affiche.
export default function Textarea({ rows = 4, className = '', ref, ...props }) {
  const { invalide, ...attributs } = useChamp(props)
  const longueur = String(attributs.value ?? '').length
  const classes = [
    'input',
    'textarea',
    invalide && 'input--erreur',
    attributs.disabled && 'input--desactive',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className="textarea__cadre">
      <div className={classes}>
        <textarea ref={ref} rows={rows} className="input__champ textarea__champ" {...attributs} />
      </div>
      {attributs.maxLength > 0 && (
        <p className="textarea__compteur" aria-live="polite">
          {longueur} / {attributs.maxLength}
          <span className="sr-only"> caractères</span>
        </p>
      )}
    </div>
  )
}
