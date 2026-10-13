import { useLayoutEffect, useMemo, useRef } from 'react'
import { SELECTEUR_TRAITS, preparerIllustration } from '../../../../lib/illustration.js'
import { mouvementReduit } from '../../../../lib/mouvement.js'
import './Illustration.css'

// Durée du tracé d'un seul élément ; les départs sont étalés sur le reste de la durée totale.
const DUREE_TRAIT = 600

// Dessin au trait inséré dans la page, tracé « à la main » à son apparition.
// source : contenu brut d'un fichier SVG (import '…svg?raw'), remplaçable sans toucher au code.
export default function Illustration({ source, prefixe, className = '', delai = 0, duree = 1600 }) {
  const ref = useRef(null)
  const balisage = useMemo(() => preparerIllustration(source, prefixe), [source, prefixe])

  // Épaisseur constante à l'écran (1,75 px) quelle que soit la taille d'affichage du dessin.
  // On n'utilise pas vector-effect: non-scaling-stroke : il fausse le tracé animé dans Chrome.
  useLayoutEffect(() => {
    const racine = ref.current
    const svg = racine?.querySelector('svg')
    const largeurVue = svg?.viewBox.baseVal?.width
    if (!largeurVue) return undefined

    const ajuster = () => {
      const echelle = svg.getBoundingClientRect().width / largeurVue
      if (echelle > 0) racine.style.setProperty('--illustration-echelle', echelle.toFixed(3))
    }
    ajuster()
    const observateur = new ResizeObserver(ajuster)
    observateur.observe(svg)
    return () => observateur.disconnect()
  }, [balisage])

  // Chaque trait reçoit sa longueur et son décalage ; le CSS fait le reste.
  useLayoutEffect(() => {
    const racine = ref.current
    if (!racine || mouvementReduit()) return

    const traits = [...racine.querySelectorAll(SELECTEUR_TRAITS)].filter(
      (element) => !element.closest('[data-zone], defs, clipPath, mask, pattern'),
    )
    const etalement = Math.max(duree - DUREE_TRAIT, 0)
    traits.forEach((element, index) => {
      const longueur = element.getTotalLength?.() ?? 0
      const depart = traits.length > 1 ? (index / (traits.length - 1)) * etalement : 0
      element.style.setProperty('--longueur', longueur.toFixed(1))
      element.style.setProperty('--delai', `${Math.round(delai + depart)}ms`)
    })
    racine.style.setProperty('--illustration-duree-trait', `${DUREE_TRAIT}ms`)
    racine.dataset.trace = 'oui'
  }, [balisage, delai, duree])

  return (
    <div
      ref={ref}
      className={`illustration ${className}`.trim()}
      dangerouslySetInnerHTML={{ __html: balisage }}
    />
  )
}
