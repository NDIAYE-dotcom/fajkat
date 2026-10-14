import { useCallback, useMemo, useRef, useState } from 'react'
import Toast from './Toast.jsx'
import { DUREES_TOAST, ToastContexte } from './toastContexte.js'
import './Toast.css'

// Au plus 4 notifications à l'écran : au-delà, les plus anciennes s'effacent.
const MAX_TOASTS = 4

// Fournit useToast() à toute l'application. Deux zones annoncées en permanence
// (une zone vide insérée en même temps que son texte n'est pas toujours lue) :
// « polite » pour les informations, « assertive » pour les erreurs.
export default function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const compteur = useRef(0)

  const fermer = useCallback((id) => {
    setToasts((liste) => liste.filter((t) => t.id !== id))
  }, [])

  const afficher = useCallback((options) => {
    compteur.current += 1
    const ton = options.ton ?? 'info'
    const toast = { duree: DUREES_TOAST[ton], ...options, ton, id: compteur.current }
    setToasts((liste) => [...liste, toast].slice(-MAX_TOASTS))
    return toast.id
  }, [])

  const api = useMemo(
    () => ({
      afficher,
      fermer,
      info: (titre, options) => afficher({ ...options, titre, ton: 'info' }),
      succes: (titre, options) => afficher({ ...options, titre, ton: 'succes' }),
      attention: (titre, options) => afficher({ ...options, titre, ton: 'attention' }),
      erreur: (titre, options) => afficher({ ...options, titre, ton: 'erreur' }),
    }),
    [afficher, fermer],
  )

  const zone = (filtre) =>
    toasts.filter(filtre).map((t) => <Toast key={t.id} {...t} onFermer={() => fermer(t.id)} />)

  return (
    <ToastContexte.Provider value={api}>
      {children}
      <section className="toast-zone" aria-label="Notifications">
        <ol className="toast-zone__liste" aria-live="assertive">
          {zone((t) => t.ton === 'erreur')}
        </ol>
        <ol className="toast-zone__liste" aria-live="polite">
          {zone((t) => t.ton !== 'erreur')}
        </ol>
      </section>
    </ToastContexte.Provider>
  )
}
