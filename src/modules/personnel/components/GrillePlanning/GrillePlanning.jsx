import { CalendarDays } from 'lucide-react'
import Button from '../../../../components/ui/Button/Button.jsx'
import EmptyState from '../../../../components/ui/EmptyState/EmptyState.jsx'
import Skeleton from '../../../../components/ui/Skeleton/Skeleton.jsx'
import { absentsDuJour, horairesCreneau, libelleJour, nomMembre } from '../../utils.js'
import './GrillePlanning.css'

// Grille de la semaine : tableau créneaux × jours sur grand écran ; sous 640 px, une
// liste jour par jour, et l'affectation se fait par sélection dans une fenêtre (aucun
// glisser-déposer). Les deux vues sont dans le DOM, une seule est affichée.
export default function GrillePlanning({
  jours,
  creneaux,
  cases,
  membres,
  calendrier,
  chargement,
  aujourdhui,
  moi,
  modifiable,
  onOuvrir,
}) {
  if (chargement) {
    return (
      <div className="grille-planning__chargement" aria-busy="true">
        <span className="sr-only">Chargement du planning…</span>
        <Skeleton forme="bloc" hauteur="12rem" />
      </div>
    )
  }
  if (creneaux.length === 0) {
    return (
      <EmptyState
        icone={CalendarDays}
        titre="Aucun créneau actif"
        texte="Ajoutez ou réactivez un créneau dans « Créneaux et horaires »."
      />
    )
  }

  const noms = (jour, creneau) => cases.get(`${jour}|${creneau.id}`) ?? []
  // Membres en congé validé, jour par jour.
  const absents = new Map(jours.map((jour) => [jour, absentsDuJour(calendrier, jour)]))
  const enConge = (jour) =>
    (membres ?? []).filter((m) => absents.get(jour).has(m.id)).map((m) => nomMembre(m))
  const unAbsent = jours.some((jour) => absents.get(jour).size > 0)

  return (
    <>
      <div className="grille-planning__defilement">
        <table className="grille-planning__table">
          <caption className="sr-only">Planning des gardes de la semaine</caption>
          <thead>
            <tr>
              <th scope="col" className="grille-planning__coin">
                Créneau
              </th>
              {jours.map((jour) => (
                <th
                  key={jour}
                  scope="col"
                  className={jour === aujourdhui ? 'grille-planning__jour--aujourdhui' : undefined}
                  aria-current={jour === aujourdhui ? 'date' : undefined}
                >
                  {libelleJour(jour, { court: true })}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {creneaux.map((creneau) => (
              <tr key={creneau.id}>
                <th scope="row" className="grille-planning__creneau">
                  {creneau.label}
                  <span className="grille-planning__horaires">{horairesCreneau(creneau)}</span>
                </th>
                {jours.map((jour) => (
                  <td
                    key={jour}
                    className={
                      jour === aujourdhui ? 'grille-planning__jour--aujourdhui' : undefined
                    }
                  >
                    <Noms liste={noms(jour, creneau)} moi={moi} absents={absents.get(jour)} />
                    {modifiable && (
                      <Button
                        variante="discret"
                        className="grille-planning__gerer"
                        onClick={() => onOuvrir(jour, creneau)}
                        aria-label={`Affecter au créneau ${creneau.label} du ${libelleJour(jour)}`}
                      >
                        Affecter
                      </Button>
                    )}
                  </td>
                ))}
              </tr>
            ))}
            {unAbsent && (
              <tr className="grille-planning__conges">
                <th scope="row">En congé</th>
                {jours.map((jour) => (
                  <td key={jour}>{enConge(jour).join(', ') || '—'}</td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <ol className="grille-planning__liste">
        {jours.map((jour) => (
          <li
            key={jour}
            className={`grille-planning__journee${
              jour === aujourdhui ? ' grille-planning__journee--aujourdhui' : ''
            }`}
          >
            <h3 className="grille-planning__titre-jour">
              {libelleJour(jour)}
              {jour === aujourdhui && (
                <span className="grille-planning__aujourdhui"> · aujourd’hui</span>
              )}
            </h3>
            <ul className="grille-planning__creneaux">
              {creneaux.map((creneau) => (
                <li key={creneau.id} className="grille-planning__ligne">
                  <span className="grille-planning__creneau">
                    {creneau.label}
                    <span className="grille-planning__horaires">{horairesCreneau(creneau)}</span>
                  </span>
                  <Noms liste={noms(jour, creneau)} moi={moi} absents={absents.get(jour)} />
                  {modifiable && (
                    <Button
                      variante="secondaire"
                      onClick={() => onOuvrir(jour, creneau)}
                      aria-label={`Affecter au créneau ${creneau.label} du ${libelleJour(jour)}`}
                    >
                      Affecter
                    </Button>
                  )}
                </li>
              ))}
            </ul>
            {absents.get(jour).size > 0 && (
              <p className="grille-planning__en-conge">En congé : {enConge(jour).join(', ')}</p>
            )}
          </li>
        ))}
      </ol>
    </>
  )
}

function Noms({ liste, moi, absents }) {
  if (liste.length === 0) return <span className="grille-planning__vide">Personne</span>
  return (
    <ul className="grille-planning__noms">
      {liste.map(({ id, membre }) => {
        const estMoi = membre?.user_id === moi
        // De garde alors que son congé est validé : conflit à régler dans le planning.
        const conflit = membre && absents?.has(membre.id)
        const classes = [
          estMoi && 'grille-planning__nom--moi',
          conflit && 'grille-planning__nom--conflit',
        ]
        return (
          <li key={id} className={classes.filter(Boolean).join(' ') || undefined}>
            {nomMembre(membre)}
            {estMoi && ' (vous)'}
            {conflit && <span className="grille-planning__conflit"> · en congé, conflit</span>}
          </li>
        )
      })}
    </ul>
  )
}
