import { formatFCFA } from '../../../../../../lib/format.js'
import TamponAnime from '../../TamponAnime/TamponAnime.jsx'
import './Recu.css'

// Montants fictifs, pour la démonstration uniquement.
const LIGNES = [
  ['Ticket de consultation prénatale', 500],
  ['Fer + acide folique × 1', 300],
]

// Reçu de caisse sur ticket 80 mm, tamponné « PAYÉ » une fois imprimé.
export default function Recu({ actif }) {
  const total = LIGNES.reduce((somme, [, montant]) => somme + montant, 0)

  return (
    <div className="recu" data-actif={actif || undefined}>
      <p className="recu__titre">Reçu de caisse</p>
      <p className="recu__sous-titre">Poste de santé · reçu n° 0347</p>
      <ul className="recu__lignes">
        {LIGNES.map(([libelle, montant]) => (
          <li key={libelle} className="recu__ligne">
            <span>{libelle}</span>
            <span className="recu__montant">{formatFCFA(montant)}</span>
          </li>
        ))}
      </ul>
      <p className="recu__total">
        <span>Total</span>
        <span>{formatFCFA(total)}</span>
      </p>
      <p className="recu__paiement">Payé par Wave · Awa D.</p>
      <TamponAnime actif={actif} delai={700} className="recu__tampon">
        Payé
      </TamponAnime>
    </div>
  )
}
