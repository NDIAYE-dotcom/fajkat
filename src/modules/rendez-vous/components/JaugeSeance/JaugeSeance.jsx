import Tampon from '../../../../components/ui/Tampon/Tampon.jsx'
import { heureCourte } from '../../utils.js'
import './JaugeSeance.css'

// Remplissage d'une séance : « Vaccination · 08:00 – 12:00 · 32 / 40 », avec une jauge.
// Sans capacité : le nombre de rendez-vous seulement. Pleine : tampon « Complet ».
export default function JaugeSeance({ seance, titre }) {
  const { capacity: capacite, prises } = seance
  const pleine = capacite != null && prises >= capacite
  const part = capacite ? Math.min(100, Math.round((prises / capacite) * 100)) : 0
  // En colonne étroite (vue semaine), la plage passe à la ligne après le tiret, jamais au
  // milieu d'une heure.
  const plage = `${heureCourte(seance.start_time)}\u00a0– ${heureCourte(seance.end_time)}`
  return (
    <div className={`jauge-seance${pleine ? ' jauge-seance--pleine' : ''}`}>
      <div className="jauge-seance__ligne">
        <span className="jauge-seance__titre">
          {titre}
          <span className="jauge-seance__plage">{plage}</span>
        </span>
        <span className="jauge-seance__compte">
          {capacite != null ? `${prises} / ${capacite}` : `${prises} rendez-vous`}
        </span>
        {pleine && <Tampon ton="alerte">Complet</Tampon>}
      </div>
      {capacite != null && (
        <div
          className="jauge-seance__barre"
          role="img"
          aria-label={`${prises} places prises sur ${capacite}`}
        >
          <span className="jauge-seance__rempli" style={{ inlineSize: `${part}%` }} />
        </div>
      )}
    </div>
  )
}
