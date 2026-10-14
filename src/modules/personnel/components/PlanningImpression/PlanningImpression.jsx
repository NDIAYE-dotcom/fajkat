import { formatDateHeure } from '../../../../lib/format.js'
import { absentsDuJour, formatJour, horairesCreneau, libelleJour, nomMembre } from '../../utils.js'
import './PlanningImpression.css'

// Version papier du planning, A4 paysage, à afficher au mur. Invisible à l'écran ;
// imprimée seule par imprimer() (src/lib/impression.js).
export default function PlanningImpression({
  structure,
  jours,
  creneaux,
  cases,
  membres,
  calendrier,
  ref,
}) {
  const enConge = (jour) => {
    const absents = absentsDuJour(calendrier, jour)
    return (membres ?? []).filter((m) => absents.has(m.id)).map((m) => nomMembre(m))
  }
  const unAbsent = jours.some((jour) => enConge(jour).length > 0)

  return (
    <article ref={ref} className="planning-impression impression-seule impression-a4-paysage">
      <header className="planning-impression__entete">
        <h1>Planning des gardes — {structure.name}</h1>
        <p className="chiffres">
          Semaine du {formatJour(jours[0])} au {formatJour(jours[6])}
        </p>
      </header>
      <table className="planning-impression__table">
        <thead>
          <tr>
            <th scope="col">Créneau</th>
            {jours.map((jour) => (
              <th key={jour} scope="col" className="planning-impression__jour">
                {libelleJour(jour, { court: true })}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {creneaux.map((creneau) => (
            <tr key={creneau.id}>
              <th scope="row">
                {creneau.label}
                <br />
                <span className="chiffres planning-impression__horaires">
                  {horairesCreneau(creneau)}
                </span>
              </th>
              {jours.map((jour) => (
                <td key={jour}>
                  {(cases.get(`${jour}|${creneau.id}`) ?? []).map(({ id, membre }) => (
                    <div key={id}>{nomMembre(membre)}</div>
                  ))}
                </td>
              ))}
            </tr>
          ))}
          {unAbsent && (
            <tr>
              <th scope="row">En congé</th>
              {jours.map((jour) => (
                <td key={jour}>{enConge(jour).join(', ')}</td>
              ))}
            </tr>
          )}
        </tbody>
      </table>
      <p className="planning-impression__pied chiffres">Imprimé le {formatDateHeure(new Date())}</p>
    </article>
  )
}
