import { BedDouble } from 'lucide-react'
import CarteFragment from '../../CarteFragment/CarteFragment.jsx'
import './LitAttribue.css'

// Lits du service de médecine (fictifs). null = libre. Le lit « Ch. 2 · L1 » est attribué à M. Diop.
const LITS = [
  { nom: 'Ch. 1 · L1', occupant: 'A.N.' },
  { nom: 'Ch. 1 · L2', occupant: 'K.S.' },
  { nom: 'Ch. 2 · L1', occupant: null, attribue: 'M. Diop' },
  { nom: 'Ch. 2 · L2', occupant: 'F.B.' },
  { nom: 'Ch. 3 · L1', occupant: 'O.T.' },
  { nom: 'Ch. 3 · L2', occupant: null },
]

// Plan des lits : le lit libre de la chambre 2 passe à « occupé » au nom de M. Diop.
export default function LitAttribue({ actif }) {
  return (
    <CarteFragment icone={BedDouble} titre="Plan des lits" precision="Médecine" actif={actif}>
      <p className="lit-attribue__compte">
        Lits occupés :{' '}
        <span className="lit-attribue__chiffres">
          <span className="lit-attribue__chiffre lit-attribue__chiffre--avant">4</span>
          <span className="lit-attribue__chiffre lit-attribue__chiffre--apres">5</span>
        </span>{' '}
        sur 6
      </p>
      <div className="lit-attribue__plan">
        {LITS.map((lit) => (
          <div
            key={lit.nom}
            className="lit-attribue__lit"
            data-etat={lit.attribue ? 'attribue' : lit.occupant ? 'occupe' : 'libre'}
          >
            <span className="lit-attribue__nom">{lit.nom}</span>
            {lit.attribue ? (
              <>
                <span className="lit-attribue__libre">Libre</span>
                <span className="lit-attribue__nouveau">{lit.attribue}</span>
              </>
            ) : (
              <span className="lit-attribue__occupant">{lit.occupant ?? 'Libre'}</span>
            )}
          </div>
        ))}
      </div>
    </CarteFragment>
  )
}
