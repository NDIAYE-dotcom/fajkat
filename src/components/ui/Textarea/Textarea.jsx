import { useState } from 'react'
import { useChamp } from '../Field/useChamp.js'
import '../Input/Input.css'
import './Textarea.css'

// En dessous de ce nombre de caractères restants, le compteur est annoncé aux lecteurs d'écran.
const SEUIL_ANNONCE = 20

// « Plus que 12 caractères », « Plus que 1 caractère », « Limite atteinte »
function annonceRestants(restants) {
  if (restants <= 0) return 'Limite de caractères atteinte'
  return `Plus que ${restants} caractère${restants > 1 ? 's' : ''}`
}

// Zone de texte (motif de consultation, observations). Avec maxLength, un compteur s'affiche,
// que la valeur soit contrôlée (value) ou libre (defaultValue, formulaire non contrôlé).
export default function Textarea({
  rows = 4,
  className = '',
  ref,
  'data-etat': etat,
  onChange,
  ...props
}) {
  const { invalide, ...attributs } = useChamp(props)
  const [longueurLibre, setLongueurLibre] = useState(String(props.defaultValue ?? '').length)
  const longueur = props.value !== undefined ? String(props.value ?? '').length : longueurLibre
  const restants = attributs.maxLength - longueur

  function surSaisie(evenement) {
    setLongueurLibre(evenement.target.value.length)
    onChange?.(evenement)
  }

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
      <div className={classes} data-etat={etat}>
        <textarea
          ref={ref}
          rows={rows}
          className="input__champ textarea__champ"
          {...attributs}
          onChange={surSaisie}
        />
      </div>
      {attributs.maxLength > 0 && (
        <p className="textarea__compteur">
          <span aria-hidden="true">
            {longueur} / {attributs.maxLength}
          </span>
          {/* Annonce seulement près de la limite : pas à chaque frappe. */}
          <span className="sr-only" aria-live="polite">
            {restants <= SEUIL_ANNONCE ? annonceRestants(restants) : ''}
          </span>
        </p>
      )}
    </div>
  )
}
