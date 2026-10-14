import { useEffect, useId, useRef, useState } from 'react'
import './MenuDeroulant.css'

// Panneau qui s'ouvre sous un bouton (motif « disclosure ») : structure, notifications,
// menu utilisateur. Se ferme avec Échap (le focus revient au bouton), un clic à côté,
// ou quand le focus quitte le menu.
// declencheur({ ouvert, attributs }) : rend le bouton, en lui passant « attributs ».
// children(fermer) : contenu du panneau.
export default function MenuDeroulant({
  declencheur,
  libelle,
  alignement = 'droite',
  className = '',
  children,
}) {
  const [ouvert, setOuvert] = useState(false)
  const id = useId()
  const racine = useRef(null)
  const bouton = useRef(null)

  useEffect(() => {
    if (!ouvert) return undefined
    function surClic(evenement) {
      if (!racine.current?.contains(evenement.target)) setOuvert(false)
    }
    function surTouche(evenement) {
      if (evenement.key !== 'Escape') return
      setOuvert(false)
      bouton.current?.focus()
    }
    document.addEventListener('pointerdown', surClic)
    document.addEventListener('keydown', surTouche)
    return () => {
      document.removeEventListener('pointerdown', surClic)
      document.removeEventListener('keydown', surTouche)
    }
  }, [ouvert])

  function surSortieFocus(evenement) {
    if (evenement.relatedTarget && !racine.current?.contains(evenement.relatedTarget)) {
      setOuvert(false)
    }
  }

  const fermer = () => setOuvert(false)

  return (
    <div ref={racine} className={`menu-deroulant ${className}`.trim()} onBlur={surSortieFocus}>
      {declencheur({
        ouvert,
        attributs: {
          ref: bouton,
          'aria-expanded': ouvert,
          'aria-controls': id,
          onClick: () => setOuvert((o) => !o),
        },
      })}
      <div
        id={id}
        className={`menu-deroulant__panneau menu-deroulant__panneau--${alignement}`}
        role="region"
        aria-label={libelle}
        hidden={!ouvert}
      >
        {ouvert && children(fermer)}
      </div>
    </div>
  )
}
