import { useEffect, useRef, useState } from 'react'
import soulignement from '../../../../assets/illustrations/annotation-soulignement.svg?raw'
import { useOffre } from '../../../../hooks/useOffre.js'
import { mouvementReduit } from '../../../../lib/mouvement.js'
import { OFFRES } from '../../../../lib/offres.js'
import Illustration from '../Illustration/Illustration.jsx'
import ApercuFile from './ApercuFile/ApercuFile.jsx'
import ApercuLits from './ApercuLits/ApercuLits.jsx'
import PanneauOffre from './PanneauOffre/PanneauOffre.jsx'
import './ChoixStructure.css'

const PANNEAUX = [
  { type: 'poste_sante', apercu: ApercuFile },
  { type: 'clinique', apercu: ApercuLits },
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
          Quelle{' '}
          <span className="choix__mot">
            structure
            <Illustration
              source={soulignement}
              prefixe="choix-soulignement"
              className="choix__soulignement"
              delai={600}
              duree={900}
            />
          </span>{' '}
          gérez-vous&nbsp;?
        </h1>
        <p className="choix__texte">
          Chaque structure a son offre. Choisissez la vôtre&nbsp;: la suite de la page lui est
          consacrée.
        </p>
      </div>

      <div
        className="choix__panneaux"
        role="group"
        aria-labelledby="titre-page"
        data-frappe={frappe ?? undefined}
      >
        {PANNEAUX.map(({ type, apercu }) => (
          <PanneauOffre
            key={type}
            offre={OFFRES[type]}
            apercu={apercu}
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
