import { useCallback, useEffect, useRef, useState } from 'react'
import { PREFIXE_BROUILLON as PREFIXE } from '../lib/brouillons.js'

// Délai après la dernière frappe (500 ms maximum) ; enregistrement immédiat si l'onglet
// est masqué ou fermé (coupure de courant, rechargement, passage à une autre application).
const DELAI_SAUVEGARDE = 400

// localStorage peut être indisponible (navigation privée, stockage plein) : jamais d'exception.
function lire(cle) {
  try {
    const brut = localStorage.getItem(PREFIXE + cle)
    return brut ? JSON.parse(brut) : null
  } catch {
    return null
  }
}

function ecrire(cle, contenu) {
  try {
    localStorage.setItem(PREFIXE + cle, JSON.stringify(contenu))
    return true
  } catch {
    return false
  }
}

function supprimer(cle) {
  try {
    localStorage.removeItem(PREFIXE + cle)
  } catch {
    // rien à faire : le brouillon disparaîtra avec le stockage
  }
}

// Brouillon automatique d'un formulaire long : les coupures d'électricité sont fréquentes.
// La saisie est enregistrée dans le navigateur peu après chaque frappe, et retrouvée
// au retour sur la page. Un formulaire revenu à son état initial n'est pas conservé.
export function useBrouillon(cle, valeurInitiale) {
  const [etat] = useState(() => lire(cle))
  const [valeur, setValeur] = useState(etat?.valeur ?? valeurInitiale)
  const [enregistreLe, setEnregistreLe] = useState(etat?.date ?? null)
  const restaure = etat !== null

  // Valeur saisie mais pas encore écrite ({ valeur } ou null), et fonction d'écriture à jour.
  const enAttente = useRef(null)
  const enregistrer = useRef(null)

  useEffect(() => {
    enregistrer.current = () => {
      if (enAttente.current === null) return
      const { valeur: aEcrire } = enAttente.current
      enAttente.current = null
      if (JSON.stringify(aEcrire) === JSON.stringify(valeurInitiale)) {
        supprimer(cle)
        setEnregistreLe(null)
        return
      }
      const date = new Date().toISOString()
      if (ecrire(cle, { valeur: aEcrire, date })) setEnregistreLe(date)
    }
  })

  useEffect(() => {
    enAttente.current = { valeur }
    const minuteur = setTimeout(() => enregistrer.current(), DELAI_SAUVEGARDE)
    return () => clearTimeout(minuteur)
  }, [cle, valeur])

  // Onglet masqué, page rechargée ou fermée, formulaire quitté : on écrit sans attendre.
  useEffect(() => {
    function surVisibilite() {
      if (document.visibilityState === 'hidden') enregistrer.current?.()
    }
    function surFermeture() {
      enregistrer.current?.()
    }
    document.addEventListener('visibilitychange', surVisibilite)
    window.addEventListener('pagehide', surFermeture)
    return () => {
      document.removeEventListener('visibilitychange', surVisibilite)
      window.removeEventListener('pagehide', surFermeture)
      enregistrer.current?.()
    }
  }, [])

  // Après un enregistrement réussi : on repart d'un formulaire vide.
  const effacer = useCallback(() => {
    enAttente.current = null
    supprimer(cle)
    setEnregistreLe(null)
    setValeur(valeurInitiale)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cle])

  return { valeur, setValeur, restaure, enregistreLe, effacer }
}
