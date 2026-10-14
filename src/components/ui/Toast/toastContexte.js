import { createContext } from 'react'

export const ToastContexte = createContext(null)

// Durée d'affichage par ton (ms). 0 = reste jusqu'à fermeture : une erreur ne doit pas
// disparaître avant d'avoir été lue.
export const DUREES_TOAST = {
  info: 5000,
  succes: 5000,
  attention: 8000,
  erreur: 0,
}
