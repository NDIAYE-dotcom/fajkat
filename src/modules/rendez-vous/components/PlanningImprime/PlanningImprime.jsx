import { formatDateHeure, formatHeure } from '../../../../lib/format.js'
import { nomComplet } from '../../../patients/utils.js'
import { ageOuNaissance, STATUTS_RDV } from '../../agenda.js'
import { libellePlanning } from '../../suivi.js'
import { dateLongue } from '../../utils.js'
import './PlanningImprime.css'

// Planning du jour sur papier A4, façon registre : une ligne par rendez-vous et une case
// « Arrivé » à cocher au stylo. Invisible à l'écran ; imprimé seul par imprimer().
// Par défaut, libellés neutres pour tout le monde (un papier traîne sur le bureau de
// l'accueil) ; versionSoignant : types réels et « Document confidentiel » en pied de page.
// Jamais la note ni le motif d'annulation.
export default function PlanningImprime({
  structure,
  date,
  rdv,
  versionSoignant,
  multiPraticiens,
  ref,
}) {
  return (
    <article ref={ref} className="planning-imprime impression-seule">
      <header className="planning-imprime__entete">
        <h1>Rendez-vous du {dateLongue(date)}</h1>
        <p>{structure.name}</p>
      </header>
      <table className="planning-imprime__table">
        <thead>
          <tr>
            <th scope="col" className="planning-imprime__heure">
              Heure
            </th>
            <th scope="col">Patient</th>
            <th scope="col">Rendez-vous</th>
            {multiPraticiens && <th scope="col">Praticien</th>}
            <th scope="col" className="planning-imprime__statut">
              Statut
            </th>
            <th scope="col" className="planning-imprime__case">
              Arrivé
            </th>
          </tr>
        </thead>
        <tbody>
          {rdv.map((r) => (
            <tr key={r.id}>
              <td className="chiffres">{formatHeure(r.starts_at)}</td>
              <td>
                {nomComplet({ last_name: r.patient_last_name, first_name: r.patient_first_name })}
                <span className="planning-imprime__identite">
                  {[r.file_number, ageOuNaissance(r)].filter(Boolean).join(' · ')}
                </span>
              </td>
              <td>{libellePlanning(r, versionSoignant)}</td>
              {multiPraticiens && <td>{r.practitioner_name ?? '—'}</td>}
              <td>{STATUTS_RDV[r.status]?.libelle ?? '—'}</td>
              <td aria-label="À cocher à l’arrivée" />
            </tr>
          ))}
        </tbody>
      </table>
      <footer className="planning-imprime__pied chiffres">
        <span>
          {rdv.length} rendez-vous · imprimé le {formatDateHeure(new Date())}
        </span>
        {versionSoignant && (
          <strong className="planning-imprime__confidentiel">
            Document confidentiel : à ne pas laisser à la vue des patients.
          </strong>
        )}
      </footer>
    </article>
  )
}
