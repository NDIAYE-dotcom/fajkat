import { Link } from 'react-router-dom'
import { useOffre } from '../../../../hooks/useOffre.js'
import './PiedDePage.css'

export default function PiedDePage() {
  const { changerOffre } = useOffre()

  return (
    <footer className="pied-de-page">
      <div className="pied-de-page__interieur">
        <p className="pied-de-page__marque">
          <span className="pied-de-page__nom">Fajkat</span>
          Gestion des structures de santé, au Sénégal puis dans l’espace UEMOA.
        </p>
        <ul className="pied-de-page__liens">
          <li>
            <button type="button" className="pied-de-page__lien" onClick={changerOffre}>
              Changer de structure
            </button>
          </li>
          <li>
            <Link to="/connexion" className="pied-de-page__lien">
              Se connecter
            </Link>
          </li>
        </ul>
      </div>
    </footer>
  )
}
