import { ChevronDown } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import ListePlateforme from '../ListePlateforme/ListePlateforme.jsx'
import './MenuPlateforme.css'

// Bouton « Plateforme » et son panneau déroulant (motif « disclosure »).
// Échap ou un clic à l'extérieur le referment ; Flèche bas l'ouvre et place le focus sur le premier lien.
export default function MenuPlateforme() {
  const [ouvert, setOuvert] = useState(false)
  const racine = useRef(null)
  const bouton = useRef(null)
  const panneau = useRef(null)
  const idPanneau = useId()
  const focusPremier = useRef(false)

  useEffect(() => {
    if (!ouvert) return undefined

    if (focusPremier.current) {
      focusPremier.current = false
      panneau.current?.querySelector('a, button')?.focus()
    }

    const surTouche = (evenement) => {
      if (evenement.key !== 'Escape') return
      setOuvert(false)
      bouton.current?.focus()
    }
    const surPointeur = (evenement) => {
      if (!racine.current?.contains(evenement.target)) setOuvert(false)
    }
    document.addEventListener('keydown', surTouche)
    document.addEventListener('pointerdown', surPointeur)
    return () => {
      document.removeEventListener('keydown', surTouche)
      document.removeEventListener('pointerdown', surPointeur)
    }
  }, [ouvert])

  // Le focus quitte le menu (Tab après le dernier lien) : il se referme.
  function surSortieFocus(evenement) {
    if (evenement.relatedTarget && !racine.current?.contains(evenement.relatedTarget)) {
      setOuvert(false)
    }
  }

  function surToucheBouton(evenement) {
    if (evenement.key !== 'ArrowDown') return
    evenement.preventDefault()
    focusPremier.current = true
    if (ouvert) panneau.current?.querySelector('a, button')?.focus()
    else setOuvert(true)
  }

  return (
    <div ref={racine} className="menu-plateforme" onBlur={surSortieFocus}>
      <button
        ref={bouton}
        type="button"
        className="menu-plateforme__bouton"
        aria-expanded={ouvert}
        aria-controls={idPanneau}
        onClick={() => setOuvert((o) => !o)}
        onKeyDown={surToucheBouton}
      >
        Plateforme
        <ChevronDown className="menu-plateforme__chevron" size={16} aria-hidden="true" />
      </button>

      <div ref={panneau} id={idPanneau} className="menu-plateforme__panneau" hidden={!ouvert}>
        {ouvert && <ListePlateforme idPrefixe="menu" onNaviguer={() => setOuvert(false)} />}
      </div>
    </div>
  )
}
