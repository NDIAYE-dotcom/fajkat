import { prixOffre } from '../../../../../lib/offres.js'
import Illustration from '../../Illustration/Illustration.jsx'
import FicheEpinglee from '../FicheEpinglee/FicheEpinglee.jsx'
import TamponFrappe from '../TamponFrappe/TamponFrappe.jsx'
import './SceneOption.css'

// Une moitié de la scène dessinée : le dessin entier est le bouton de choix.
// etat : 'repos' | 'frappe' (ce dessin vient d'être tamponné) | 'estompe' (l'autre l'a été).
export default function SceneOption({ offre, source, delai, rappel, etat = 'repos', onChoisir }) {
  const prix = prixOffre(offre)
  const libelle = [`${offre.nom}, ${prix} par mois`, rappel && 'dernière offre consultée']
    .filter(Boolean)
    .join(', ')

  return (
    <button
      type="button"
      className={`scene-option scene-option--${offre.type} scene-option--${etat}`}
      data-offre={offre.type}
      aria-label={libelle}
      aria-disabled={etat !== 'repos' || undefined}
      onClick={() => etat === 'repos' && onChoisir(offre.type)}
    >
      <span className="scene-option__cadre">
        <Illustration
          source={source}
          prefixe={`scene-${offre.type}`}
          className="scene-option__dessin"
          delai={delai}
        />
        <FicheEpinglee nom={offre.nom} prix={prix} className="scene-option__fiche" />
        {etat === 'frappe' && (
          <TamponFrappe className="scene-option__tampon">{offre.nom}</TamponFrappe>
        )}
      </span>

      <span className="scene-option__legende" aria-hidden="true">
        <span className="scene-option__nom">{offre.nom}</span>
        <span className="scene-option__reperage">
          {offre.choix.reperage}
          {rappel && <span className="scene-option__rappel"> · déjà consultée</span>}
        </span>
      </span>
    </button>
  )
}
