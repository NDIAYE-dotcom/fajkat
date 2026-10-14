import { cloneElement, useEffect, useId, useState } from 'react'
import './Tooltip.css'

// Info-bulle : complément d'information seulement (jamais la seule source d'une information,
// le survol n'existe pas sur téléphone). S'affiche au survol et au focus, Échap la masque,
// et on peut passer la souris dessus sans qu'elle disparaisse (WCAG 1.4.13).
// children : un seul élément focalisable (bouton, lien).
export default function Tooltip({ texte, position = 'haut', children }) {
  const id = useId()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!visible) return undefined
    function surTouche(evenement) {
      if (evenement.key === 'Escape') setVisible(false)
    }
    document.addEventListener('keydown', surTouche)
    return () => document.removeEventListener('keydown', surTouche)
  }, [visible])

  const decritPar = [children.props['aria-describedby'], id].filter(Boolean).join(' ')

  return (
    <span
      className={`tooltip tooltip--${position}`}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      {cloneElement(children, { 'aria-describedby': decritPar })}
      <span
        id={id}
        role="tooltip"
        className={`tooltip__bulle${visible ? ' tooltip__bulle--visible' : ''}`}
      >
        {texte}
      </span>
    </span>
  )
}
