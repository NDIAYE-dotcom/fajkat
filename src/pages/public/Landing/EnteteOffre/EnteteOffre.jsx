import { ArrowLeftRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useOffre } from '../../../../hooks/useOffre.js'
import { prixOffreParMois } from '../../../../lib/offres.js'
import './EnteteOffre.css'

// Bandeau fixe des pages d'offre : rappelle l'offre affichée et permet d'en changer.
export default function EnteteOffre() {
  const { offre, changerOffre } = useOffre()

  return (
    <header className="entete-offre">
      <div className="entete-offre__interieur">
        <span className="entete-offre__marque">Fajkat</span>

        <p className="entete-offre__offre">
          <span className="sr-only">Offre affichée : </span>
          <span className="entete-offre__pastille" aria-hidden="true" />
          <span className="entete-offre__nom">{offre.nom}</span>
          <span className="entete-offre__prix">{prixOffreParMois(offre)}</span>
        </p>

        <div className="entete-offre__actions">
          <button type="button" className="entete-offre__changer" onClick={changerOffre}>
            <ArrowLeftRight size={16} aria-hidden="true" />
            Changer de structure
          </button>
          <Link to="/connexion" className="entete-offre__connexion">
            Se connecter
          </Link>
        </div>
      </div>
    </header>
  )
}
