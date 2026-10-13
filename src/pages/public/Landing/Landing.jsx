import { useEffect, useRef } from 'react'
import { OffreProvider } from '../../../context/OffreContext.jsx'
import { useOffre } from '../../../hooks/useOffre.js'
import ChoixStructure from './ChoixStructure/ChoixStructure.jsx'
import OffreClinique from './OffreClinique/OffreClinique.jsx'
import OffrePoste from './OffrePoste/OffrePoste.jsx'
import './Landing.css'

// Sans View Transitions API, chaque changement de vue se fait par un simple fondu CSS.
const FONDU_SECOURS = typeof document !== 'undefined' && !document.startViewTransition

// Page d'accueil : écran de choix obligatoire, puis la page de l'offre choisie.
export default function Landing() {
  return (
    <OffreProvider>
      <ContenuLanding />
    </OffreProvider>
  )
}

function ContenuLanding() {
  const { offre } = useOffre()
  const type = offre?.type ?? null
  const premierAffichage = useRef(true)

  useEffect(() => {
    document.title = offre
      ? `Fajkat — Offre ${offre.nom}`
      : 'Fajkat — Gestion des structures de santé'
  }, [offre])

  // À chaque changement de vue, le focus va au titre principal : un lecteur d'écran
  // annonce ainsi la nouvelle page, et la navigation au clavier repart du haut.
  useEffect(() => {
    if (premierAffichage.current) {
      premierAffichage.current = false
      return
    }
    document.getElementById('titre-page')?.focus()
  }, [type])

  let vue = <ChoixStructure />
  if (offre?.type === 'clinique') vue = <OffreClinique offre={offre} />
  else if (offre) vue = <OffrePoste offre={offre} />

  if (!FONDU_SECOURS) return vue
  return (
    <div key={type ?? 'choix'} className="landing-fondu">
      {vue}
    </div>
  )
}
