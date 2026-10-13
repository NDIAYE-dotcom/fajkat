import { useEffect, useRef, useState } from 'react'
import { useOffre } from '../../../../hooks/useOffre.js'
import { mouvementReduit } from '../../../../lib/mouvement.js'
import { OFFRES } from '../../../../lib/offres.js'
import ApercuFile from './ApercuFile/ApercuFile.jsx'
import ApercuLits from './ApercuLits/ApercuLits.jsx'
import CarteOffre from './CarteOffre/CarteOffre.jsx'
import './ChoixStructure.css'

// Illustrations fournies (public/images/), converties en WebP : 720 px de large pour
// les grands écrans, 480 px pour les téléphones (versions mobiles dédiées, plus légères).
const CARTES = [
  {
    type: 'poste_sante',
    apercu: ApercuFile,
    image: '/images/poste-sante.webp',
    imageMobile: '/images/poste-sante-mobile.webp',
  },
  {
    type: 'clinique',
    apercu: ApercuLits,
    image: '/images/clinique.webp',
    imageMobile: '/images/clinique-mobile.webp',
  },
]

// Temps laissé au tampon (180 ms de frappe) pour être vu avant de passer à la page de l'offre.
const PAUSE_TAMPON = 520

// Écran d'arrivée obligatoire : rien d'autre n'est rendu tant qu'aucune offre n'est choisie.
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
    <main className="choix">
      <div className="choix__intro">
        <p className="choix__surtitre">Gestion des structures de santé · Sénégal et UEMOA</p>
        <h1 id="titre-page" className="choix__titre" tabIndex={-1}>
          Quelle <span className="choix__mot">structure</span> gérez-vous&nbsp;?
        </h1>
      </div>

      <div
        className="choix__cartes"
        role="group"
        aria-labelledby="titre-page"
        data-frappe={frappe ?? undefined}
      >
        {CARTES.map(({ type, apercu, image, imageMobile }, rang) => (
          <CarteOffre
            key={type}
            offre={OFFRES[type]}
            apercu={apercu}
            image={image}
            imageMobile={imageMobile}
            rang={rang}
            rappel={derniereOffre === type}
            etat={etatDe(type)}
            onChoisir={choisir}
          />
        ))}
      </div>

      <p className="choix__pied">Vous pourrez changer de structure à tout moment.</p>
    </main>
  )
}
