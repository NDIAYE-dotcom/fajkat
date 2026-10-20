import { Link, useLocation } from 'react-router-dom'
import Tampon from '../../../../components/ui/Tampon/Tampon.jsx'
import { formatDateHeure } from '../../../../lib/format.js'
import { GENRES, statutLigne } from '../../dossier.js'
import { etatRetour } from '../../utils.js'
import './LigneChronologie.css'

// Une ligne de la chronologie : quand, quoi, qui. Consultation, ordonnance, référence et
// certificat mènent à la consultation (le retour ramène à la fiche).
export default function LigneChronologie({ ligne: l }) {
  const location = useLocation()
  const statut = statutLigne(l)
  const lien = l.encounter_id ? `/app/consultations/${l.encounter_id}` : null
  const precisions = [l.detail, l.author_name].filter(Boolean).join(' · ')

  return (
    <li className={`ligne-chronologie ligne-chronologie--${l.kind}`}>
      <p className="ligne-chronologie__quand">{formatDateHeure(l.occurred_at)}</p>
      <div className="ligne-chronologie__quoi">
        <p className="ligne-chronologie__genre">{GENRES[l.kind] ?? 'Dossier'}</p>
        <p className="ligne-chronologie__titre">
          {lien ? (
            <Link to={lien} state={etatRetour(location)} className="ligne-chronologie__lien">
              {l.title}
            </Link>
          ) : (
            <span>{l.title}</span>
          )}
          {statut && (
            <Tampon ton={statut.ton} long={statut.long}>
              {statut.libelle}
            </Tampon>
          )}
          {l.is_sensitive && <Tampon ton="alerte">Sensible</Tampon>}
        </p>
        {precisions && <p className="ligne-chronologie__precisions">{precisions}</p>}
      </div>
    </li>
  )
}
