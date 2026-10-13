import { useEffect, useState } from 'react'

// Vrai quand l'élément est à l'écran ET que l'onglet est affiché.
// Sert à mettre en pause les animations qu'on ne voit pas : moins de calcul sur les petits téléphones.
export function useVisible(ref, { seuil = 0.15 } = {}) {
  // Sans IntersectionObserver (très vieux navigateur), l'élément est considéré visible.
  const [dansEcran, setDansEcran] = useState(() => typeof IntersectionObserver === 'undefined')
  const [ongletAffiche, setOngletAffiche] = useState(
    () => typeof document === 'undefined' || document.visibilityState !== 'hidden',
  )

  useEffect(() => {
    const element = ref.current
    if (!element || typeof IntersectionObserver === 'undefined') return undefined
    const observateur = new IntersectionObserver(
      ([entree]) => setDansEcran(entree.isIntersecting),
      { threshold: seuil },
    )
    observateur.observe(element)
    return () => observateur.disconnect()
  }, [ref, seuil])

  useEffect(() => {
    const surChangement = () => setOngletAffiche(document.visibilityState !== 'hidden')
    document.addEventListener('visibilitychange', surChangement)
    return () => document.removeEventListener('visibilitychange', surChangement)
  }, [])

  return dansEcran && ongletAffiche
}
