import { Receipt } from 'lucide-react'
import { formatFCFA } from '../../../../../../lib/format.js'
import CarteFragment from '../../CarteFragment/CarteFragment.jsx'
import TamponAnime from '../../TamponAnime/TamponAnime.jsx'
import './Facture.css'

// Montants et taux fictifs, pour la démonstration uniquement.
const ACTES = [
  ['Consultation · médecine interne', 15000],
  ['Examens de laboratoire', 18000],
  ['Hospitalisation · 1 nuit', 35000],
]
const TAUX_PRISE_EN_CHARGE = 80 // %, IPM fictive

// Facture de sortie : la barre se partage entre la part assurance et la part patient,
// puis la part patient est tamponnée « PAYÉ ».
export default function Facture({ actif }) {
  const total = ACTES.reduce((somme, [, montant]) => somme + montant, 0)
  const partAssurance = Math.round((total * TAUX_PRISE_EN_CHARGE) / 100)
  const partPatient = total - partAssurance

  return (
    <CarteFragment icone={Receipt} titre="Facture de sortie" precision="M. Diop" actif={actif}>
      <ul className="facture__actes">
        {ACTES.map(([libelle, montant]) => (
          <li key={libelle} className="facture__acte">
            <span>{libelle}</span>
            <span className="facture__montant">{formatFCFA(montant)}</span>
          </li>
        ))}
      </ul>
      <p className="facture__total">
        <span>Total</span>
        <span className="facture__montant">{formatFCFA(total)}</span>
      </p>

      <span className="facture__barre" style={{ '--part': TAUX_PRISE_EN_CHARGE / 100 }}>
        <span className="facture__barre-assurance" />
      </span>
      <div className="facture__parts">
        <p className="facture__part">
          <span className="facture__pastille facture__pastille--assurance" />
          IPM · {TAUX_PRISE_EN_CHARGE} %<strong>{formatFCFA(partAssurance)}</strong>
        </p>
        <p className="facture__part">
          <span className="facture__pastille" />
          Part patient<strong>{formatFCFA(partPatient)}</strong>
        </p>
      </div>
      <TamponAnime actif={actif} delai={1500} className="facture__tampon">
        Payé
      </TamponAnime>
    </CarteFragment>
  )
}
