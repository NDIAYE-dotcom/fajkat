import Button from '../../../../components/ui/Button/Button.jsx'
import Tampon from '../../../../components/ui/Tampon/Tampon.jsx'
import { formatHeure } from '../../../../lib/format.js'
import BoutonConsultation from '../../../consultations/components/BoutonConsultation/BoutonConsultation.jsx'
import { libelleAge, nomComplet } from '../../../patients/utils.js'
import { ACTIONS, duree } from '../../utils.js'
import './CarteFile.css'

// Temps affiché sur la carte, selon l'étape.
function temps(ligne, maintenant) {
  switch (ligne.status) {
    case 'waiting':
    case 'vitals':
      return `attend depuis ${duree(ligne.arrived_at, maintenant)}`
    case 'consultation':
      return `en consultation depuis ${duree(ligne.consultation_at ?? ligne.status_changed_at, maintenant)}`
    case 'done':
      return `terminé à ${formatHeure(ligne.finished_at ?? ligne.status_changed_at)}`
    default:
      return `parti à ${formatHeure(ligne.left_at ?? ligne.status_changed_at)}`
  }
}

// Fiche d'un patient sur le tableau. Motif et alerte des constantes : soignants seulement
// (la base les renvoie vides pour les autres rôles). Chaque déplacement possible a son
// bouton : glisser une carte est difficile sur un petit téléphone. consultation :
// l'utilisateur rédige des consultations (« Commencer la consultation » en consultation).
export default function CarteFile({
  ligne,
  maintenant,
  ecrire,
  medical,
  consultation,
  horsLigne,
  occupe,
  onAction,
  onGlisser,
}) {
  // Constantes : soignants seulement, tant que le passage n'est pas clos.
  const constantes =
    medical && ['waiting', 'vitals', 'consultation'].includes(ligne.status)
      ? [{ id: 'constantes', libelle: 'Constantes', constantes: true }]
      : []
  const actions = [...(ecrire ? (ACTIONS[ligne.status] ?? []) : []), ...constantes]
  const urgence = ligne.priority === 'emergency'

  return (
    <li
      className={`carte-file${urgence ? ' carte-file--urgence' : ''}`}
      draggable={ecrire && !horsLigne}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', ligne.visit_id)
        e.dataTransfer.effectAllowed = 'move'
        onGlisser?.(ligne)
      }}
    >
      <div className="carte-file__haut">
        <span className="carte-file__ticket">{ligne.ticket_number}</span>
        {urgence ? (
          <Tampon statut="urgent" />
        ) : (
          ligne.priority !== 'normal' && (
            <span className="carte-file__priorite">{ligne.priority_label}</span>
          )
        )}
      </div>
      <p className="carte-file__nom">{nomComplet(ligne)}</p>
      <p className="carte-file__details">
        {ligne.sex} · {libelleAge(ligne)} · {ligne.service_label}
      </p>
      {ligne.reason && <p className="carte-file__motif">Motif : {ligne.reason}</p>}
      <p className="carte-file__temps">
        {temps(ligne, maintenant)}
        {ligne.room_label && ['vitals', 'consultation'].includes(ligne.status) && (
          <> · {ligne.room_label}</>
        )}
        {ligne.call_count > 1 && <> · appelé {ligne.call_count} fois</>}
      </p>
      {(ligne.vitals_level || ligne.has_vitals) && (
        <p className="carte-file__constantes">
          {ligne.vitals_level === 'alert' && <Tampon ton="alerte">Constantes en alerte</Tampon>}
          {ligne.vitals_level === 'warning' && <Tampon ton="encre">À surveiller</Tampon>}
          {!ligne.vitals_level && ligne.has_vitals && 'Constantes prises'}
        </p>
      )}
      {consultation && ligne.status === 'consultation' && (
        <div className="carte-file__actions">
          <BoutonConsultation
            patientId={ligne.patient_id}
            visiteId={ligne.visit_id}
            ariaLabel={`Commencer la consultation : ${ligne.ticket_number}`}
          />
        </div>
      )}
      {actions.length > 0 && (
        <div className="carte-file__actions">
          {actions.map((a) => (
            <Button
              key={a.id}
              variante={a.principale ? 'primaire' : 'discret'}
              chargement={occupe === a.id}
              disabled={horsLigne || (occupe !== null && occupe !== a.id)}
              onClick={() => onAction(ligne, a)}
              aria-label={`${a.libelle} : ${ligne.ticket_number}`}
            >
              {a.libelle}
            </Button>
          ))}
        </div>
      )}
    </li>
  )
}
