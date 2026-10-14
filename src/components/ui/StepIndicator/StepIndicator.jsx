import { Check } from 'lucide-react'
import './StepIndicator.css'

// Progression d'un formulaire en plusieurs étapes (inscription, nouveau patient…).
// etapes : liste de libellés ; courante : index (0 = première étape).
// Sur téléphone, seul le libellé de l'étape courante est écrit, sous « Étape 2 sur 4 ».
export default function StepIndicator({
  etapes,
  courante,
  libelle = 'Progression',
  className = '',
}) {
  return (
    <nav className={`step-indicator ${className}`.trim()} aria-label={libelle}>
      <p className="step-indicator__resume" aria-hidden="true">
        Étape {courante + 1} sur {etapes.length} : <strong>{etapes[courante]}</strong>
      </p>
      <ol className="step-indicator__liste">
        {etapes.map((etape, index) => {
          const etat = index < courante ? 'fait' : index === courante ? 'courant' : 'a-venir'
          return (
            <li
              key={etape}
              className={`step-indicator__etape step-indicator__etape--${etat}`}
              aria-current={etat === 'courant' ? 'step' : undefined}
            >
              <span className="step-indicator__marque" aria-hidden="true">
                {etat === 'fait' ? <Check size={16} strokeWidth={2.5} /> : index + 1}
              </span>
              <span className="step-indicator__libelle">
                {etape}
                {etat === 'fait' && <span className="sr-only"> (terminée)</span>}
                {etat === 'a-venir' && <span className="sr-only"> (à venir)</span>}
              </span>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
