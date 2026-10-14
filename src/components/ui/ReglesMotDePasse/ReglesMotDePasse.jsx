import { Check, Circle } from 'lucide-react'
import { REGLES_MOT_DE_PASSE } from '../../../lib/motDePasse.js'
import Icone from '../Icone/Icone.jsx'
import './ReglesMotDePasse.css'

// Règles du mot de passe, cochées au fil de la frappe.
// id : à relier au champ par aria-describedby.
export default function ReglesMotDePasse({ id, motDePasse }) {
  return (
    <ul id={id} className="regles-mot-de-passe" aria-label="Règles du mot de passe">
      {REGLES_MOT_DE_PASSE.map((regle) => {
        const ok = regle.respectee(motDePasse)
        return (
          <li
            key={regle.id}
            className={`regles-mot-de-passe__regle${ok ? ' regles-mot-de-passe__regle--ok' : ''}`}
          >
            <Icone icone={ok ? Check : Circle} />
            <span>
              {regle.libelle}
              <span className="sr-only">{ok ? ' : respectée' : ' : pas encore respectée'}</span>
            </span>
          </li>
        )
      })}
    </ul>
  )
}
