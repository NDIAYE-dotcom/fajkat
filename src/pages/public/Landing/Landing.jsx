import { Suspense, lazy, useEffect, useRef } from 'react'
import { Navigate, useLocation, useSearchParams } from 'react-router-dom'
import { useOffre } from '../../../hooks/useOffre.js'
import { getOffre } from '../../../lib/offres.js'
import { titrePage } from '../../../lib/partage.js'
import './Landing.css'

// Écran de choix et page d'offre chargés à la demande : un lien partagé vers /clinique
// ne télécharge pas l'écran de choix, et inversement.
const importerPageOffre = () => import('./PageOffre/PageOffre.jsx')
const ChoixStructure = lazy(() => import('./ChoixStructure/ChoixStructure.jsx'))
const PageOffre = lazy(importerPageOffre)

// Depuis l'écran de choix, la page d'offre est préchargée pendant que le visiteur regarde
// les cartes : le passage à l'offre reste instantané.
const DELAI_PRECHARGEMENT = 1500

// Sans View Transitions API, chaque changement de vue se fait par un simple fondu CSS.
const FONDU_SECOURS = typeof document !== 'undefined' && !document.startViewTransition

// Page d'accueil : écran de choix obligatoire sur « / », page de l'offre sur
// « /poste-de-sante » et « /clinique ». En-tête et pied de page : voir PublicLayout.
export default function Landing() {
  const [parametres] = useSearchParams()
  const { hash } = useLocation()

  // Anciennes adresses (/?offre=clinique) : redirection vers la nouvelle, sans entrée
  // supplémentaire dans l'historique (le bouton Retour ne revient pas sur l'ancienne).
  const ancienneOffre = getOffre(parametres.get('offre'))
  if (ancienneOffre) return <Navigate to={{ pathname: ancienneOffre.chemin, hash }} replace />

  return <ContenuLanding />
}

function ContenuLanding() {
  const { offre } = useOffre()
  const type = offre?.type ?? null
  const premierAffichage = useRef(true)
  const { pathname, hash, key } = useLocation()

  useEffect(() => {
    document.title = titrePage(pathname)
  }, [pathname])

  // À chaque changement de vue, le focus va au titre principal : un lecteur d'écran
  // annonce ainsi la nouvelle page, et la navigation au clavier repart du haut.
  useEffect(() => {
    if (premierAffichage.current) {
      premierAffichage.current = false
      return
    }
    document.getElementById('titre-page')?.focus()
  }, [type])

  // Lien vers une section (#tarif, #faq, #module-patients…) : on l'amène à l'écran.
  // Placé après l'effet de focus, pour passer après lui quand l'offre change en même temps.
  useEffect(() => {
    if (!hash) return
    document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView({ block: 'start' })
  }, [hash, key, type])

  useEffect(() => {
    if (type) return undefined
    const minuterie = setTimeout(importerPageOffre, DELAI_PRECHARGEMENT)
    return () => clearTimeout(minuterie)
  }, [type])

  // La clé remonte la page à chaque changement d'offre : le parcours repart de sa première étape.
  const page = offre ? <PageOffre key={offre.type} offre={offre} /> : <ChoixStructure />
  // Pendant le chargement, un espace de la hauteur de l'écran évite que le pied de page remonte.
  const vue = <Suspense fallback={<div className="landing-attente" />}>{page}</Suspense>

  if (!FONDU_SECOURS) return vue
  return (
    <div key={type ?? 'choix'} className="landing-fondu">
      {vue}
    </div>
  )
}
