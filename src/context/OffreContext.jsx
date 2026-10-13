import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { getOffre } from '../lib/offres.js'
import { OffreContext } from './offreContexte.js'

// Choix commercial du visiteur sur le site public.
// Ce n'est ni une authentification ni une autorisation : il ne fait que choisir
// la présentation affichée. L'offre d'une structure inscrite viendra de la base.

const CLE_SESSION = 'fajkat.derniereOffre'

function lireDerniereOffre() {
  try {
    return getOffre(window.sessionStorage.getItem(CLE_SESSION))?.type ?? null
  } catch {
    return null
  }
}

function memoriserOffre(type) {
  try {
    window.sessionStorage.setItem(CLE_SESSION, type)
  } catch {
    // Stockage indisponible (navigation privée, réglages) : le choix reste dans l'URL.
  }
}

export function OffreProvider({ children }) {
  const [parametres, setParametres] = useSearchParams()
  const [derniereOffre, setDerniereOffre] = useState(lireDerniereOffre)

  // L'URL est la source de vérité : ?offre=poste_sante ou ?offre=clinique.
  // Une valeur inconnue est ignorée et ramène à l'écran de choix.
  const offre = getOffre(parametres.get('offre'))

  const choisirOffre = useCallback(
    (type) => {
      if (!getOffre(type)) return
      memoriserOffre(type)
      setDerniereOffre(type)
      setParametres({ offre: type })
      window.scrollTo(0, 0)
    },
    [setParametres],
  )

  const changerOffre = useCallback(() => {
    setParametres({})
    window.scrollTo(0, 0)
  }, [setParametres])

  // Le thème de couleur suit l'offre affichée, puis est retiré en quittant la page.
  useEffect(() => {
    const racine = document.documentElement
    if (offre) racine.dataset.offre = offre.type
    else delete racine.dataset.offre
    return () => delete racine.dataset.offre
  }, [offre])

  const valeur = useMemo(
    () => ({ offre, derniereOffre, choisirOffre, changerOffre }),
    [offre, derniereOffre, choisirOffre, changerOffre],
  )

  return <OffreContext.Provider value={valeur}>{children}</OffreContext.Provider>
}
