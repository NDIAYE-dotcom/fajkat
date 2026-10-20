import { PICTOGRAMMES } from '../../pictogrammes.js'
import './PictogrammePrise.css'

// Pictogramme d'une prise (matin, midi, soir, nuit), décoratif : le libellé est écrit à côté.
// Trait de 1,75 dans la feuille de style.
export default function PictogrammePrise({ prise, className = '' }) {
  return (
    <svg
      className={`pictogramme-prise ${className}`.trim()}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PICTOGRAMMES[prise].map((e, i) =>
        e.cercle ? <circle key={i} {...e.cercle} /> : <path key={i} d={e.d} />,
      )}
    </svg>
  )
}
