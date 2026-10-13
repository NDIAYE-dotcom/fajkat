import { useEffect, useRef, useState } from 'react'
import { mouvementReduit } from '../lib/mouvement.js'

// Apparition au défilement, déclenchée une seule fois : renvoie [ref, apparu].
// Le conteneur reçoit data-apparu quand il entre à l'écran ; ses enfants marqués
// de la classe « apparition » montent alors en fondu (voir src/styles/apparition.css),
// décalés de 80 ms selon leur variable --rang.
// Sans IntersectionObserver ou avec les animations réduites, tout est visible d'emblée.
export function useApparition({ seuil = 0.15 } = {}) {
  const ref = useRef(null)
  const [apparu, setApparu] = useState(
    () => typeof IntersectionObserver === 'undefined' || mouvementReduit(),
  )

  useEffect(() => {
    const element = ref.current
    if (apparu || !element) return undefined
    const observateur = new IntersectionObserver(
      ([entree]) => {
        if (!entree.isIntersecting) return
        setApparu(true)
        observateur.disconnect()
      },
      { threshold: seuil, rootMargin: '0px 0px -8% 0px' },
    )
    observateur.observe(element)
    return () => observateur.disconnect()
  }, [apparu, seuil])

  return [ref, apparu]
}
