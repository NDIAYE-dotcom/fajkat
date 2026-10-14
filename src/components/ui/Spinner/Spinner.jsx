import './Spinner.css'

// Indicateur de chargement circulaire. Avec « libelle », il est annoncé aux lecteurs d'écran ;
// sans libellé, il est décoratif (le parent porte déjà aria-busy ou un texte).
export default function Spinner({ libelle, taille = 20, className = '' }) {
  return (
    <span
      className={`spinner ${className}`.trim()}
      style={{ '--spinner-taille': `${taille}px` }}
      role={libelle ? 'status' : undefined}
      aria-hidden={libelle ? undefined : 'true'}
    >
      {libelle && <span className="sr-only">{libelle}</span>}
    </span>
  )
}
