import { ArrowLeftRight, Menu, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useOffre } from '../../../../../hooks/useOffre.js'
import BoutonDemo from '../../BoutonDemo/BoutonDemo.jsx'
import ListePlateforme from '../ListePlateforme/ListePlateforme.jsx'
import './TiroirMobile.css'

const FOCUSABLES = 'a[href], button:not([disabled])'

// Menu des petits écrans : un tiroir plein écran (boîte de dialogue modale).
// Le focus y reste enfermé tant qu'il est ouvert, et revient au bouton « Menu » à la fermeture.
export default function TiroirMobile() {
  const { offre, changerOffre } = useOffre()
  const [ouvert, setOuvert] = useState(false)
  const bouton = useRef(null)
  const tiroir = useRef(null)

  useEffect(() => {
    if (!ouvert) return undefined
    const boutonMenu = bouton.current
    const ancienDefilement = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    tiroir.current?.querySelector(FOCUSABLES)?.focus()

    const surTouche = (evenement) => {
      if (evenement.key === 'Escape') {
        setOuvert(false)
        return
      }
      if (evenement.key !== 'Tab') return
      const elements = [...(tiroir.current?.querySelectorAll(FOCUSABLES) ?? [])]
      const premier = elements[0]
      const dernier = elements[elements.length - 1]
      if (evenement.shiftKey && document.activeElement === premier) {
        evenement.preventDefault()
        dernier?.focus()
      } else if (!evenement.shiftKey && document.activeElement === dernier) {
        evenement.preventDefault()
        premier?.focus()
      }
    }
    document.addEventListener('keydown', surTouche)
    return () => {
      document.removeEventListener('keydown', surTouche)
      document.body.style.overflow = ancienDefilement
      boutonMenu?.focus()
    }
  }, [ouvert])

  const fermer = () => setOuvert(false)

  return (
    <>
      <button
        ref={bouton}
        type="button"
        className="tiroir-mobile__ouvrir"
        aria-expanded={ouvert}
        aria-haspopup="dialog"
        onClick={() => setOuvert(true)}
      >
        <Menu size={20} aria-hidden="true" />
        Menu
      </button>

      {ouvert && (
        <div
          ref={tiroir}
          className="tiroir-mobile"
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
        >
          <div className="tiroir-mobile__barre">
            <span className="tiroir-mobile__marque">Fajkat</span>
            <button type="button" className="tiroir-mobile__fermer" onClick={fermer}>
              <X size={20} aria-hidden="true" />
              Fermer
            </button>
          </div>

          <div className="tiroir-mobile__corps">
            {offre && (
              <button
                type="button"
                className="tiroir-mobile__changer"
                onClick={() => {
                  fermer()
                  changerOffre()
                }}
              >
                <ArrowLeftRight size={18} aria-hidden="true" />
                Changer de structure (offre {offre.nom})
              </button>
            )}

            <p className="tiroir-mobile__rubrique">Plateforme</p>
            <ListePlateforme idPrefixe="tiroir" onNaviguer={fermer} />
          </div>

          <div className="tiroir-mobile__actions">
            <Link to="/connexion" className="tiroir-mobile__connexion">
              Se connecter
            </Link>
            <BoutonDemo offre={offre} />
          </div>
        </div>
      )}
    </>
  )
}
