import { Link } from 'react-router-dom'
import Tampon from '../../../../components/ui/Tampon/Tampon.jsx'
import { formatHeure } from '../../../../lib/format.js'
import { nomComplet } from '../../../patients/utils.js'
import { estClos, STATUTS_RDV } from '../../agenda.js'
import './LigneRdvCompacte.css'

// Rendez-vous en format compact (vue semaine, colonnes étroites) : heure et nom sur une
// ligne, précisions (type, praticien) dessous, chacune tronquée par « … » sans jamais
// couper un mot ni déborder. Le texte complet reste dans le lien et en infobulle.
export default function LigneRdvCompacte({ rdv, precisions = [] }) {
  const statut = STATUTS_RDV[rdv.status]
  const nom = nomComplet({ last_name: rdv.patient_last_name, first_name: rdv.patient_first_name })
  const detail = precisions.filter(Boolean).join(' · ')
  const heure = formatHeure(rdv.starts_at)
  return (
    <li className={`ligne-rdv-compacte${estClos(rdv) ? ' ligne-rdv-compacte--clos' : ''}`}>
      <Link
        className="ligne-rdv-compacte__lien"
        to={`/app/patients/${rdv.patient_id}`}
        title={[heure, nom, detail].filter(Boolean).join(' · ')}
      >
        <span className="ligne-rdv-compacte__ligne">
          <span className="ligne-rdv-compacte__heure">{heure}</span>
          <span className="ligne-rdv-compacte__nom">{nom}</span>
        </span>
        {detail && <span className="ligne-rdv-compacte__detail">{detail}</span>}
      </Link>
      {statut && rdv.status !== 'scheduled' && (
        <Tampon ton={statut.ton} className="ligne-rdv-compacte__tampon">
          {statut.libelle}
        </Tampon>
      )}
    </li>
  )
}
