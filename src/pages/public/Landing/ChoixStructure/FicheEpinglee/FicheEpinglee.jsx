import './FicheEpinglee.css'

// Petite fiche cartonnée épinglée sur le dessin : le nom de l'offre et son prix.
// Purement visuelle : le bouton parent porte déjà le nom et le prix dans son aria-label.
export default function FicheEpinglee({ nom, prix, className = '' }) {
  return (
    <span className={`fiche-epinglee ${className}`.trim()} aria-hidden="true">
      <span className="fiche-epinglee__nom">{nom} —</span>
      <span className="fiche-epinglee__prix">{prix} / mois</span>
    </span>
  )
}
