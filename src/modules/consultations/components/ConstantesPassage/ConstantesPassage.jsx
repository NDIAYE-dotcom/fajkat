import { formatHeure } from '../../../../lib/format.js'
import AlertesConstantes from '../../../accueil/components/AlertesConstantes/AlertesConstantes.jsx'
import { regrouperAlertes, resumeMesure } from '../../../accueil/constantes.js'
import './ConstantesPassage.css'

// Constantes prises pendant le passage (file d'attente), reprises dans la consultation.
export default function ConstantesPassage({ mesures, avecPassage }) {
  if (!mesures?.length) {
    return (
      <p className="constantes-passage__vide">
        {avecPassage
          ? 'Aucune constante prise pendant ce passage. Elles se prennent depuis la file d’attente (bouton « Constantes »).'
          : 'Consultation sans passage par la file d’attente : aucune constante reprise.'}
      </p>
    )
  }
  return (
    <ul className="constantes-passage">
      {mesures.map((m) => (
        <li key={m.id} className="constantes-passage__ligne">
          <span className="constantes-passage__heure">{formatHeure(m.measured_at)}</span>
          <span className="constantes-passage__valeurs">{resumeMesure(m)}</span>
          <AlertesConstantes alertes={regrouperAlertes(m.alerts, m.systolic, m.diastolic)} />
        </li>
      ))}
    </ul>
  )
}
