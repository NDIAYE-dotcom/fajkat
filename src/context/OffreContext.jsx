import { useCallback, useEffect, useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { getOffre, OFFRES, offreDepuisChemin } from '../lib/offres.js'
import { OffreContext } from './offreContexte.js'

// Choix commercial du visiteur sur le site public.
// Ce n'est ni une authentification ni une autorisation : il ne fait que choisir
// la présentation affichée. L'offre d'une structure inscrite viendra de la base.

const CLE_STOCKAGE = 'fajkat.offre'

function lireDerniereOffre() {
  try {
    return getOffre(window.localStorage.getItem(CLE_STOCKAGE))?.type ?? null
  } catch {
    return null
  }
}

function memoriserOffre(type) {
  try {
    window.localStorage.setItem(CLE_STOCKAGE, type)
  } catch {
    // Stockage indisponible (navigation privée, réglages) : seul le rappel « déjà consultée » est perdu.
  }
}

export function OffreProvider({ children }) {
  const { pathname } = useLocation()
  const navigate = useNavigate()

  // L'adresse est la source de vérité : /poste-de-sante ou /clinique.
  // Toute autre adresse publique (/, pages légales) n'a pas d'offre affichée.
  const offre = offreDepuisChemin(pathname)

  // Dernière offre consultée, relue à chaque changement d'adresse : au retour sur l'écran
  // de choix, la carte correspondante porte « Déjà consultée ».
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const derniereOffre = useMemo(() => offre?.type ?? lireDerniereOffre(), [pathname])

  // Toute page d'offre affichée, qu'on y arrive par l'écran de choix ou par un lien partagé,
  // devient la « dernière offre consultée ».
  useEffect(() => {
    if (offre) memoriserOffre(offre.type)
  }, [offre])

  // transition : passage animé par la View Transitions API (ignoré si le navigateur ne la gère pas).
  const choisirOffre = useCallback(
    (type, { transition = false } = {}) => {
      if (!getOffre(type)) return
      navigate(OFFRES[type].chemin, { viewTransition: transition })
      window.scrollTo(0, 0)
    },
    [navigate],
  )

  const changerOffre = useCallback(() => {
    navigate('/')
    window.scrollTo(0, 0)
  }, [navigate])

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
