import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useOffre } from '../../../../hooks/useOffre.js'
import { OFFRES, TYPES_OFFRE, prixOffre } from '../../../../lib/offres.js'
import './ChoixStructure.css'

// Écran d'arrivée obligatoire : rien d'autre n'est rendu tant qu'aucune offre n'est choisie.
export default function ChoixStructure() {
  const { choisirOffre, derniereOffre } = useOffre()

  return (
    <div className="choix">
      <header className="choix__entete">
        <span className="choix__marque">Fajkat</span>
        <Link to="/connexion" className="choix__connexion">
          Se connecter
        </Link>
      </header>

      <main className="choix__corps">
        <div className="choix__intro">
          <p className="choix__surtitre">Gestion des structures de santé · Sénégal</p>
          <h1 id="titre-page" className="choix__titre" tabIndex={-1}>
            Quelle structure souhaitez-vous gérer&nbsp;?
          </h1>
          <p className="choix__texte">
            Découvrez une solution de gestion adaptée à votre établissement de santé.
          </p>
        </div>

        <ul className="choix__options">
          {TYPES_OFFRE.map((type) => {
            const offre = OFFRES[type]
            return (
              <li key={type} className="choix__option">
                <button
                  type="button"
                  className="feuillet"
                  data-offre={type}
                  aria-labelledby={`choix-${type}-action`}
                  aria-describedby={`choix-${type}-description choix-${type}-prix`}
                  onClick={() => choisirOffre(type)}
                >
                  <span className="feuillet__reperage">{offre.choix.reperage}</span>
                  <span id={`choix-${type}-nom`} className="feuillet__nom">
                    {offre.nom}
                  </span>
                  <span id={`choix-${type}-description`} className="feuillet__description">
                    {offre.choix.description}
                  </span>
                  <span className="feuillet__pied">
                    <span id={`choix-${type}-prix`} className="feuillet__prix">
                      <span className="feuillet__montant">{prixOffre(offre)}</span>
                      <span className="feuillet__periode">/mois</span>
                    </span>
                    <span id={`choix-${type}-action`} className="feuillet__action">
                      {offre.choix.bouton}
                      <ArrowRight className="feuillet__fleche" size={18} aria-hidden="true" />
                    </span>
                  </span>
                  {derniereOffre === type && (
                    <span className="feuillet__rappel">Dernière offre consultée</span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      </main>

      <footer className="choix__pied">
        <p>Vous pourrez changer de structure à tout moment.</p>
      </footer>
    </div>
  )
}
