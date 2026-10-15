import { useCallback, useEffect, useRef, useState } from 'react'
import { chargerEcranPublic, ecouterEcran } from '../api.js'

// Actualisation de secours : jamais plus d'une lecture par minute par écran.
const SECOURS_MS = 60 * 1000
// Délai avant de rouvrir un canal tombé (le client Supabase retente aussi de son côté).
const RECONNEXION_MS = 5 * 1000
const NB_APPELS = 6

// Un appel = un passage appelé une fois de plus (rappel compris).
const cleAppel = (a) => `${a.visit_id}:${a.call_count}`

function fusionner(anciens, nouveaux) {
  const parCle = new Map(anciens.map((a) => [cleAppel(a), a]))
  for (const a of nouveaux) parCle.set(cleAppel(a), a)
  return [...parCle.values()]
    .sort((a, b) => new Date(b.called_at) - new Date(a.called_at))
    .slice(0, NB_APPELS)
}

// Écran d'appel : lecture initiale, appels poussés par la base (Broadcast), reconnexion
// automatique, actualisation de secours toutes les 60 s. surNouvelAppel : un appel arrivé
// depuis la dernière lecture (son, mise en évidence).
// etat : chargement | valid | revoked | unavailable | unknown ; connexion : en_ligne | reconnexion.
export function useEcranAppel(jeton, surNouvelAppel) {
  const [etat, setEtat] = useState('chargement')
  const [infos, setInfos] = useState(null)
  const [appels, setAppels] = useState([])
  const [connexion, setConnexion] = useState('reconnexion')
  const [topic, setTopic] = useState(null)
  const vus = useRef(null) // clés des appels déjà connus (null avant la première lecture)
  const rappel = useRef(surNouvelAppel)
  useEffect(() => {
    rappel.current = surNouvelAppel
  }, [surNouvelAppel])

  const recevoir = useCallback((liste) => {
    const nouveaux = liste.filter((a) => vus.current && !vus.current.has(cleAppel(a)))
    vus.current ??= new Set()
    liste.forEach((a) => vus.current.add(cleAppel(a)))
    setAppels((anciens) => fusionner(anciens, liste))
    if (nouveaux.length > 0) rappel.current?.(nouveaux[0])
  }, [])

  const relire = useCallback(async () => {
    try {
      const reponse = await chargerEcranPublic(jeton)
      setEtat(reponse.status)
      if (reponse.status !== 'valid') return
      setInfos({ structure: reponse.org_name, ecran: reponse.screen_label })
      setTopic(reponse.topic)
      recevoir(reponse.calls ?? [])
    } catch {
      // Réseau coupé : l'écran garde ce qu'il affiche ; la lecture suivante rattrapera.
      setConnexion('reconnexion')
    }
  }, [jeton, recevoir])

  // Première lecture, secours toutes les 60 s, et dès le retour du réseau.
  useEffect(() => {
    const premier = setTimeout(relire, 0)
    const minuteur = setInterval(relire, SECOURS_MS)
    window.addEventListener('online', relire)
    return () => {
      clearTimeout(premier)
      clearInterval(minuteur)
      window.removeEventListener('online', relire)
    }
  }, [relire])

  // Canal Broadcast : rouvert après une coupure ; relecture à chaque (re)connexion pour
  // rattraper les appels manqués pendant la coupure.
  useEffect(() => {
    if (!topic || etat !== 'valid') return undefined
    let desabonner = () => {}
    let minuteur = null
    let actif = true
    const ouvrir = () => {
      desabonner = ecouterEcran(topic, {
        surAppel: (appel) => recevoir([appel]),
        surRetrait: () => setEtat('revoked'),
        surEtat: (statut) => {
          if (!actif) return
          if (statut === 'SUBSCRIBED') {
            setConnexion('en_ligne')
            relire()
          } else if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(statut)) {
            setConnexion('reconnexion')
            clearTimeout(minuteur)
            minuteur = setTimeout(() => {
              desabonner()
              if (actif) ouvrir()
            }, RECONNEXION_MS)
          }
        },
      })
    }
    ouvrir()
    return () => {
      actif = false
      clearTimeout(minuteur)
      desabonner()
    }
  }, [topic, etat, recevoir, relire])

  return { etat, infos, appels, connexion }
}

// L'écran ne se met jamais en veille (Wake Lock), tant que la page est visible ; le verrou
// est repris au retour sur la page. false si le navigateur ne le permet pas.
export function useEcranEveille(actif) {
  const [possible] = useState(() => typeof navigator !== 'undefined' && 'wakeLock' in navigator)
  useEffect(() => {
    if (!actif || !possible) return undefined
    let verrou = null
    let fini = false
    const prendre = async () => {
      if (document.visibilityState !== 'visible') return
      try {
        verrou = await navigator.wakeLock.request('screen')
        if (fini) verrou.release()
      } catch {
        // Refusé (économie d'énergie) : on réessaiera au retour sur la page.
      }
    }
    prendre()
    document.addEventListener('visibilitychange', prendre)
    return () => {
      fini = true
      document.removeEventListener('visibilitychange', prendre)
      verrou?.release().catch(() => {})
    }
  }, [actif, possible])
  return possible
}
