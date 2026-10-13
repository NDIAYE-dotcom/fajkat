import { Check, FlaskConical, Send } from 'lucide-react'
import CarteFragment from '../../CarteFragment/CarteFragment.jsx'
import './Examens.css'

// rang : ordre d'apparition de la coche (les examens non demandés n'en ont pas).
const EXAMENS = [
  { nom: 'Numération formule sanguine (NFS)', rang: 0 },
  { nom: 'Glycémie à jeun', rang: 1 },
  { nom: 'Créatinine', rang: 2 },
  { nom: 'Bilan hépatique', rang: null },
]

// Demande d'examens cochée depuis la consultation, puis envoyée au laboratoire.
export default function Examens({ actif }) {
  return (
    <CarteFragment icone={FlaskConical} titre="Demande d’examens" precision="M. Diop" actif={actif}>
      <ul className="examens">
        {EXAMENS.map(({ nom, rang }) => (
          <li key={nom} className="examens__ligne">
            <span
              className="examens__case"
              data-coche={rang !== null || undefined}
              style={rang !== null ? { '--i': rang } : undefined}
            >
              <Check size={14} strokeWidth={3} />
            </span>
            {nom}
          </li>
        ))}
      </ul>
      <p className="examens__envoi">
        <Send size={16} />
        Envoyée au laboratoire · 09:52
      </p>
    </CarteFragment>
  )
}
