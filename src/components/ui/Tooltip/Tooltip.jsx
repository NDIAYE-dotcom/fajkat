import { cloneElement, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import './Tooltip.css'

// Distance minimale entre la bulle et le bord de l'écran.
const MARGE = 8

// Info-bulle : complément d'information seulement (jamais la seule source d'une information,
// le survol n'existe pas sur téléphone). S'affiche au survol et au focus, Échap la masque,
// et on peut passer la souris dessus sans qu'elle disparaisse (WCAG 1.4.13).
// Près d'un bord, la bulle se décale pour rester entière à l'écran (la pointe, elle, reste
// face à l'élément) ; sans place au-dessus, elle passe dessous, et inversement.
// children : un seul élément focalisable (bouton, lien).
export default function Tooltip({ texte, position = 'haut', children }) {
  const id = useId()
  const bulle = useRef(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!visible) return undefined
    function surTouche(evenement) {
      if (evenement.key === 'Escape') setVisible(false)
    }
    document.addEventListener('keydown', surTouche)
    return () => document.removeEventListener('keydown', surTouche)
  }, [visible])

  // Mesure avant affichage : aucun saut visible.
  useLayoutEffect(() => {
    const element = bulle.current
    if (!visible || !element) return
    const largeurEcran = document.documentElement.clientWidth
    const hauteurEcran = window.innerHeight

    element.dataset.placement = position
    element.style.setProperty('--tooltip-decalage', '0px')
    let rect = element.getBoundingClientRect()

    if (position === 'haut' && rect.top < MARGE) element.dataset.placement = 'bas'
    if (position === 'bas' && rect.bottom > hauteurEcran - MARGE) element.dataset.placement = 'haut'
    rect = element.getBoundingClientRect()

    let decalage = 0
    if (rect.left < MARGE) decalage = MARGE - rect.left
    else if (rect.right > largeurEcran - MARGE) decalage = largeurEcran - MARGE - rect.right
    element.style.setProperty('--tooltip-decalage', `${Math.round(decalage)}px`)
  }, [visible, position])

  const decritPar = [children.props['aria-describedby'], id].filter(Boolean).join(' ')

  return (
    <span
      className="tooltip"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      {cloneElement(children, { 'aria-describedby': decritPar })}
      {/* Masquée, la bulle reste dans le DOM : aria-describedby continue de la lire. */}
      <span
        ref={bulle}
        id={id}
        role="tooltip"
        data-placement={position}
        className={`tooltip__bulle${visible ? ' tooltip__bulle--visible' : ''}`}
      >
        {texte}
      </span>
    </span>
  )
}
