import { CircleAlert } from 'lucide-react'
import Icone from '../../ui/Icone/Icone.jsx'
import Spinner from '../../ui/Spinner/Spinner.jsx'
import './EcranAttente.css'

// Écran plein pendant l'ouverture de la session ou le chargement de la structure.
// Avec « erreur » : message rassurant et actions (Réessayer…) passées en enfants.
// integre : à l'intérieur d'une page qui a déjà son cadre (pas d'écran plein, pas de <main>).
export default function EcranAttente({ libelle, erreur, integre = false, children }) {
  const Conteneur = integre ? 'div' : 'main'
  return (
    <Conteneur
      className={`ecran-attente${integre ? ' ecran-attente--integre' : ''}`}
      aria-busy={!erreur}
    >
      {erreur ? (
        <div className="ecran-attente__erreur" role="alert">
          <p className="ecran-attente__titre">
            <Icone icone={CircleAlert} className="ecran-attente__icone" />
            {libelle}
          </p>
          <p>{erreur}</p>
          {children && <div className="ecran-attente__actions">{children}</div>}
        </div>
      ) : (
        <p className="ecran-attente__chargement">
          <Spinner taille={24} />
          <span role="status">{libelle}</span>
        </p>
      )}
    </Conteneur>
  )
}
