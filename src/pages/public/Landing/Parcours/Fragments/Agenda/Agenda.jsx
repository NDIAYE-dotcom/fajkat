import { CalendarDays } from 'lucide-react'
import CarteFragment from '../../CarteFragment/CarteFragment.jsx'
import './Agenda.css'

// Praticiens et créneaux fictifs. null = créneau libre.
const PRATICIENS = [
  { nom: 'Dr A. Sarr', specialite: 'Médecine interne', creneaux: ['Mme Kane', null, 'M. Gaye'] },
  { nom: 'Dr F. Ndiaye', specialite: 'Pédiatrie', creneaux: [null, 'Bébé Sow', null] },
  { nom: 'Dr M. Fall', specialite: 'Gynécologie', creneaux: ['Mme Ba', 'Mme Diallo', null] },
]
const HEURES = ['09:00', '09:30', '10:00']

// Agenda multi-praticiens : le créneau de 09:30 du Dr Sarr se remplit avec M. Diop.
export default function Agenda({ actif }) {
  return (
    <CarteFragment icone={CalendarDays} titre="Agenda" precision="Lundi" actif={actif}>
      <div className="agenda">
        <span />
        {PRATICIENS.map((p) => (
          <span key={p.nom} className="agenda__praticien">
            <span className="agenda__nom">{p.nom}</span>
            <span className="agenda__specialite">{p.specialite}</span>
          </span>
        ))}
        {HEURES.map((heure, ligne) => (
          <div key={heure} className="agenda__rangee">
            <span className="agenda__heure">{heure}</span>
            {PRATICIENS.map((p, colonne) => {
              const nouveau = colonne === 0 && ligne === 1
              const occupant = p.creneaux[ligne]
              return (
                <span
                  key={p.nom}
                  className="agenda__creneau"
                  data-etat={nouveau ? 'nouveau' : occupant ? 'pris' : 'libre'}
                >
                  {nouveau ? <span className="agenda__rdv">M. Diop</span> : (occupant ?? 'Libre')}
                </span>
              )
            })}
          </div>
        ))}
      </div>
    </CarteFragment>
  )
}
