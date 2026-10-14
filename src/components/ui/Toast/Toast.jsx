import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import './Toast.css'

const ICONES = { info: Info, succes: CircleCheck, attention: TriangleAlert, erreur: CircleAlert }
const PREFIXES = { info: 'Information', succes: 'Réussi', attention: 'Attention', erreur: 'Erreur' }

// Une notification. Le minuteur s'arrête quand on la survole ou qu'on y place le focus.
export default function Toast({ ton = 'info', titre, message, action, duree, onFermer }) {
  const Icone = ICONES[ton]
  const minuteur = useRef(null)

  function demarrer() {
    if (duree > 0) minuteur.current = setTimeout(onFermer, duree)
  }

  function suspendre() {
    clearTimeout(minuteur.current)
  }

  useEffect(() => {
    demarrer()
    return suspendre
    // eslint-disable-next-line react-hooks/exhaustive-deps -- minuteur lancé une seule fois
  }, [])

  return (
    <li
      className={`toast toast--${ton}`}
      onMouseEnter={suspendre}
      onMouseLeave={demarrer}
      onFocus={suspendre}
      onBlur={demarrer}
    >
      <Icone className="toast__icone" aria-hidden="true" />
      <div className="toast__texte">
        <p className="toast__titre">
          <span className="sr-only">{PREFIXES[ton]} : </span>
          {titre}
        </p>
        {message && <p className="toast__message">{message}</p>}
        {action && (
          <button
            type="button"
            className="toast__action"
            onClick={() => {
              action.onClick?.()
              onFermer()
            }}
          >
            {action.libelle}
          </button>
        )}
      </div>
      <button
        type="button"
        className="toast__fermer"
        aria-label="Fermer la notification"
        onClick={onFermer}
      >
        <X aria-hidden="true" />
      </button>
    </li>
  )
}
