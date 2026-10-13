import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { OffreProvider } from '../../../context/OffreContext.jsx'
import { useOffre } from '../../../hooks/useOffre.js'
import ChoixStructure from './ChoixStructure/ChoixStructure.jsx'
import EnTete from './EnTete/EnTete.jsx'
import PageOffre from './PageOffre/PageOffre.jsx'
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
  const { hash, key } = useLocation()

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

  // Lien du menu « Plateforme » (#module-patients…) : on amène le module à l'écran.
  // Placé après l'effet de focus, pour passer après lui quand l'offre change en même temps.
  useEffect(() => {
    if (!hash) return
    document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView({ block: 'start' })
  }, [hash, key, type])

  // La clé remonte la page à chaque changement d'offre : le parcours repart de sa première étape.
  const vue = offre ? <PageOffre key={offre.type} offre={offre} /> : <ChoixStructure />

  return (
    <>
      <EnTete />
      {FONDU_SECOURS ? (
        <div key={type ?? 'choix'} className="landing-fondu">
          {vue}
        </div>
      ) : (
        vue
      )}
    </>
  )
}
