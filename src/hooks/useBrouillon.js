import { useCallback, useEffect, useState } from 'react'

const PREFIXE = 'fajkat.brouillon.'
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

  useEffect(() => {
    const minuteur = setTimeout(() => {
      if (JSON.stringify(valeur) === JSON.stringify(valeurInitiale)) {
        supprimer(cle)
        setEnregistreLe(null)
        return
      }
      const date = new Date().toISOString()
      if (ecrire(cle, { valeur, date })) setEnregistreLe(date)
    }, DELAI_SAUVEGARDE)
    return () => clearTimeout(minuteur)
    // valeurInitiale : constante du formulaire, volontairement hors dépendances
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cle, valeur])

  // Après un enregistrement réussi : on repart d'un formulaire vide.
  const effacer = useCallback(() => {
    supprimer(cle)
    setEnregistreLe(null)
    setValeur(valeurInitiale)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cle])

  return { valeur, setValeur, restaure, enregistreLe, effacer }
}
