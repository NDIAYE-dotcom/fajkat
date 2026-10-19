import { formatTelephone } from '../../../../lib/format.js'
import { libelleAge, libelleNaissance, libelleTitulaire, nomComplet } from '../../utils.js'
import './LignePatient.css'

// Résumé d'un patient sur deux lignes : nom et numéro, puis ce qui distingue les
// homonymes (âge, téléphone et son titulaire, quartier, prénom de la mère).
// Utilisé par l'alerte de doublons et par la recherche de l'en-tête.
export default function LignePatient({ patient, className = '' }) {
  const details = [
    [libelleAge(patient), libelleNaissance(patient)].filter(Boolean).join(', '),
    patient.phone &&
      `${formatTelephone(patient.phone)}${patient.phone_owner ? ` (${libelleTitulaire(patient.phone_owner, patient.sex)})` : ''}`,
    patient.neighborhood,
    patient.mother_first_name && `mère : ${patient.mother_first_name}`,
    patient.legacy_file_number && `ancien n° ${patient.legacy_file_number}`,
  ].filter(Boolean)
  // Trouvé par le numéro d'un dossier fusionné dans celui-ci (carte ou papier ancien).
  const fusionne = patient.merged_file_numbers

  return (
    <span className={`ligne-patient ${className}`.trim()}>
      <span className="ligne-patient__haut">
        <span className="ligne-patient__nom">{nomComplet(patient)}</span>
        <span className="ligne-patient__numero">{patient.file_number}</span>
      </span>
      {details.length > 0 && <span className="ligne-patient__details">{details.join(' · ')}</span>}
      {fusionne && (
        <span className="ligne-patient__fusion">ancien dossier {fusionne}, fusionné</span>
      )}
    </span>
  )
}
