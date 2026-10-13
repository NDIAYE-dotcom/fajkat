import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import fleche from '../../../../assets/illustrations/annotation-fleche.svg?raw'
import soulignement from '../../../../assets/illustrations/annotation-soulignement.svg?raw'
import sceneClinique from '../../../../assets/illustrations/scene-clinique.svg?raw'
import scenePoste from '../../../../assets/illustrations/scene-poste-sante.svg?raw'
import { useOffre } from '../../../../hooks/useOffre.js'
import { mouvementReduit } from '../../../../lib/mouvement.js'
import { OFFRES } from '../../../../lib/offres.js'
import Illustration from '../Illustration/Illustration.jsx'
import SceneOption from './SceneOption/SceneOption.jsx'
import './ChoixStructure.css'

const SCENES = [
  { type: 'poste_sante', source: scenePoste, delai: 0 },
  { type: 'clinique', source: sceneClinique, delai: 250 },
]

// Temps laissé au tampon pour être vu avant de passer à la page de l'offre.
const PAUSE_TAMPON = 520

// Écran d'arrivée obligatoire : rien d'autre n'est rendu tant qu'aucune offre n'est choisie.
// Les deux moitiés de la scène dessinée sont les deux choix.
export default function ChoixStructure() {
  const { choisirOffre, derniereOffre } = useOffre()
  const [frappe, setFrappe] = useState(null)
  const minuterie = useRef(null)

  useEffect(() => () => clearTimeout(minuterie.current), [])

  function choisir(type) {
    if (frappe) return
    if (mouvementReduit()) {
      choisirOffre(type)
      return
    }
    setFrappe(type)
    minuterie.current = setTimeout(() => choisirOffre(type, { transition: true }), PAUSE_TAMPON)
  }

  function etatDe(type) {
    if (!frappe) return 'repos'
    return frappe === type ? 'frappe' : 'estompe'
  }

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
            Quelle{' '}
            <span className="choix__mot">
              structure
              <Illustration
                source={soulignement}
                prefixe="choix-soulignement"
                className="choix__soulignement"
                delai={1500}
                duree={900}
              />
            </span>{' '}
            gérez-vous&nbsp;?
          </h1>
          <p className="choix__texte">Touchez le dessin qui ressemble à votre établissement.</p>
          <Illustration
            source={fleche}
            prefixe="choix-fleche"
            className="choix__fleche"
            delai={1900}
            duree={1000}
          />
        </div>

        <div className="choix__scene" role="group" aria-labelledby="titre-page">
          {SCENES.map(({ type, source, delai }) => (
            <SceneOption
              key={type}
              offre={OFFRES[type]}
              source={source}
              delai={delai}
              rappel={derniereOffre === type}
              etat={etatDe(type)}
              onChoisir={choisir}
            />
          ))}
        </div>
      </main>

      <footer className="choix__pied">
        <p>Vous pourrez changer de structure à tout moment.</p>
      </footer>
    </div>
  )
}
