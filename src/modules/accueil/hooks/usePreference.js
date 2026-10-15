import { useState } from 'react'

// Réglage propre à cet appareil (salle de l'appelant, file affichée) : une commodité,
// pas une donnée. Stockage indisponible (navigation privée) : on garde la valeur en mémoire.
export function usePreference(cle, valeurParDefaut) {
  const [valeur, setValeur] = useState(() => {
    try {
      return localStorage.getItem(cle) ?? valeurParDefaut
    } catch {
      return valeurParDefaut
    }
  })
  function changer(nouvelle) {
    setValeur(nouvelle)
    try {
      if (nouvelle) localStorage.setItem(cle, nouvelle)
      else localStorage.removeItem(cle)
    } catch {
      // rien : la valeur reste en mémoire pour cette page
    }
  }
  return [valeur, changer]
}
