import Icone from '../Icone/Icone.jsx'
import './BoutonIcone.css'

// Bouton réduit à une icône, réservé aux actions secondaires et évidentes
// (fermer une notification, effacer une recherche). Une action importante
// (enregistrer, valider, supprimer) utilise Button avec un texte visible.
// « label » est obligatoire : c'est le nom du bouton pour les lecteurs d'écran.
export default function BoutonIcone({ icone, label, className = '', ...props }) {
  if (import.meta.env.DEV && !label) {
    console.error(
      'BoutonIcone : la propriété « label » est obligatoire (nom accessible du bouton).',
    )
  }

  return (
    <button
      type="button"
      className={`bouton-icone ${className}`.trim()}
      aria-label={label}
      {...props}
    >
      <Icone icone={icone} />
    </button>
  )
}
