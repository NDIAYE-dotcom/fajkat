import { Link } from 'react-router-dom'
import Tampon from '../../../../components/ui/Tampon/Tampon.jsx'
import { formatHeure } from '../../../../lib/format.js'
import { nomComplet } from '../../../patients/utils.js'
import { ageOuNaissance, estClos, STATUTS_RDV } from '../../agenda.js'
import './LigneRdv.css'

// Un rendez-vous dans l'agenda : heure, patient (lien vers sa fiche) avec son numéro de
// dossier et son âge (homonymes), précisions, statut.
// « Prévu » n'a pas de tampon : seul ce qui change est marqué.
// precisions : textes affichés sous le nom (type, praticien…), selon la vue.
export default function LigneRdv({ rdv, precisions = [] }) {
  const statut = STATUTS_RDV[rdv.status]
  const detail = [...precisions, rdv.series_index && `Série, n° ${rdv.series_index}`]
    .filter(Boolean)
    .join(' · ')
  return (
    <li className={`ligne-rdv${estClos(rdv) ? ' ligne-rdv--clos' : ''}`}>
      <span className="ligne-rdv__heure">{formatHeure(rdv.starts_at)}</span>
      <span className="ligne-rdv__corps">
        <Link className="ligne-rdv__nom" to={`/app/patients/${rdv.patient_id}`}>
          {nomComplet({ last_name: rdv.patient_last_name, first_name: rdv.patient_first_name })}
        </Link>
        <span className="ligne-rdv__identite">
          {rdv.file_number && <span className="ligne-rdv__dossier">{rdv.file_number}</span>}
          {ageOuNaissance(rdv) && <span>{ageOuNaissance(rdv)}</span>}
        </span>
        {detail && <span className="ligne-rdv__detail">{detail}</span>}
      </span>
      {statut && rdv.status !== 'scheduled' && (
        <Tampon ton={statut.ton} className="ligne-rdv__tampon">
          {statut.libelle}
        </Tampon>
      )}
    </li>
  )
}
