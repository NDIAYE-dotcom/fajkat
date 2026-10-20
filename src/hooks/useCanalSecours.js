import { useEffect, useRef, useState } from 'react'

// Relecture de secours : jamais plus d'une par minute et par appareil.
const SECOURS_MS = 60 * 1000
// Délai avant de rouvrir un canal tombé (le client Supabase retente aussi de son côté).
const RECONNEXION_MS = 5 * 1000
const STATUTS_COUPES = ['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED']

// Filet de secours d'un canal Realtime, comme la cloche (src/hooks/useNotifications.js) :
//   - état du canal suivi ; canal rouvert 5 s après une coupure (erreur, délai dépassé,
//     fermeture, limite de connexions de l'offre Supabase atteinte) ;
//   - relecture à chaque (re)connexion du canal, au retour du réseau et au retour sur
//     l'onglet (téléphone ou télévision sortis de veille) ;
//   - relecture toutes les 60 s tant que le canal n'est pas abonné, ou toujours si
//     « toujours » (écran d'appel allumé toute la journée : jamais figé, même si le canal
//     semble abonné sans plus rien recevoir).
// ouvrir(surEtat) ouvre le canal et renvoie sa fonction de désabonnement (null : pas de
// canal pour l'instant, la relecture de secours tourne seule) ; surEtat reçoit le statut
// du client Supabase. ouvrir doit être stable (useCallback). Renvoie true si le canal est
// abonné.
export function useCanalSecours(ouvrir, relire, { actif = true, toujours = false } = {}) {
  const [abonne, setAbonne] = useState(false)
  const relireRef = useRef(relire)
  useEffect(() => {
    relireRef.current = relire
  }, [relire])

  useEffect(() => {
    if (!actif || !ouvrir) return undefined
    let enCours = true
    let minuteur = null
    let desabonner = () => {}
    const demarrer = () => {
      // Un canal retiré (removeChannel annonce « CLOSED ») ne relance rien.
      let retire = false
      const arreter = ouvrir((statut) => {
        if (!enCours || retire) return
        if (statut === 'SUBSCRIBED') {
          setAbonne(true)
          relireRef.current()
        } else if (STATUTS_COUPES.includes(statut)) {
          setAbonne(false)
          if (minuteur) return
          minuteur = setTimeout(() => {
            minuteur = null
            desabonner()
            if (enCours) demarrer()
          }, RECONNEXION_MS)
        }
      })
      desabonner = () => {
        retire = true
        arreter()
      }
    }
    demarrer()
    return () => {
      enCours = false
      clearTimeout(minuteur)
      desabonner()
      setAbonne(false)
    }
  }, [actif, ouvrir])

  useEffect(() => {
    if (!actif) return undefined
    const lire = () => relireRef.current()
    const surVisibilite = () => {
      if (document.visibilityState === 'visible') lire()
    }
    window.addEventListener('online', lire)
    document.addEventListener('visibilitychange', surVisibilite)
    const minuteur = toujours || !abonne ? setInterval(lire, SECOURS_MS) : null
    return () => {
      window.removeEventListener('online', lire)
      document.removeEventListener('visibilitychange', surVisibilite)
      clearInterval(minuteur)
    }
  }, [actif, abonne, toujours])

  return abonne
}
