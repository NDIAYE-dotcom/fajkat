import { useSyncExternalStore } from 'react'

function abonner(rappel) {
  window.addEventListener('online', rappel)
  window.addEventListener('offline', rappel)
  return () => {
    window.removeEventListener('online', rappel)
    window.removeEventListener('offline', rappel)
  }
}

// true si le navigateur se croit connecté. navigator.onLine peut dire « en ligne » sur un
// réseau sans Internet : les erreurs réseau restent gérées à chaque requête.
export function useEnLigne() {
  return useSyncExternalStore(
    abonner,
    () => navigator.onLine,
    () => true,
  )
}
