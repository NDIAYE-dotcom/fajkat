import { useEffect } from 'react'

const PREFIXE = /^\(\d+\+?\) /

// Préfixe le titre de l'onglet par le nombre de non lues : « (2) Personnel — … — Fajkat ».
// Chaque page fixe son propre titre : on réapplique le préfixe quand il change.
export function useTitreNonLues(nombre) {
  useEffect(() => {
    const prefixe = nombre > 0 ? `(${nombre > 9 ? '9+' : nombre}) ` : ''
    function appliquer() {
      const base = document.title.replace(PREFIXE, '')
      const voulu = prefixe + base
      if (document.title !== voulu) document.title = voulu
    }
    appliquer()
    const balise = document.querySelector('title')
    if (!balise) return undefined
    const observateur = new MutationObserver(appliquer)
    observateur.observe(balise, { childList: true, characterData: true, subtree: true })
    return () => {
      observateur.disconnect()
      document.title = document.title.replace(PREFIXE, '')
    }
  }, [nombre])
}
