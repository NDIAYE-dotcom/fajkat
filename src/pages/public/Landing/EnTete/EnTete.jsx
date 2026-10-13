import { ArrowLeftRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useOffre } from '../../../../hooks/useOffre.js'
import { prixOffreParMois } from '../../../../lib/offres.js'
import BoutonDemo from '../BoutonDemo/BoutonDemo.jsx'
import MenuPlateforme from './MenuPlateforme/MenuPlateforme.jsx'
import TiroirMobile from './TiroirMobile/TiroirMobile.jsx'
import './EnTete.css'

// En-tête commun à l'écran de choix et aux pages d'offre.
// Grand écran : menu « Plateforme » déroulant. Petit écran : tout passe dans le tiroir « Menu ».
export default function EnTete() {
  const { offre, changerOffre } = useOffre()

  // La marque ramène à l'écran de choix.
  function versAccueil(evenement) {
    evenement.preventDefault()
    changerOffre()
  }

  return (
    <header className={`en-tete ${offre ? 'en-tete--offre' : ''}`.trim()}>
      <div className="en-tete__interieur">
        <a href="/" className="en-tete__marque" onClick={versAccueil}>
          Fajkat
        </a>

        <nav className="en-tete__nav" aria-label="Navigation principale">
          <MenuPlateforme />
        </nav>

        {offre && (
          <div className="en-tete__offre">
            <p className="en-tete__offre-nom">
              <span className="sr-only">Offre affichée : </span>
              <span className="en-tete__pastille" aria-hidden="true" />
              {offre.nom}
              <span className="en-tete__prix">{prixOffreParMois(offre)}</span>
            </p>
            <button type="button" className="en-tete__changer" onClick={changerOffre}>
              <ArrowLeftRight size={16} aria-hidden="true" />
              <span>
                Changer<span className="en-tete__changer-suite"> de structure</span>
              </span>
            </button>
          </div>
        )}

        <div className="en-tete__actions">
          <Link to="/connexion" className="en-tete__connexion">
            Se connecter
          </Link>
          <BoutonDemo offre={offre} compact />
          <span className="en-tete__menu-mobile">
            <TiroirMobile />
          </span>
        </div>
      </div>
    </header>
  )
}
