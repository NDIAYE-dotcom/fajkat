import { useCallback, useEffect, useRef, useState } from 'react'
import { useCanalSecours } from '../../../hooks/useCanalSecours.js'
import { chargerEcranPublic, ecouterEcran } from '../api.js'

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
// automatique, actualisation de secours toutes les 60 s même connecté (une télévision
// allumée toute la journée ne reste jamais figée), au retour du réseau et au retour sur
// la page (useCanalSecours). surNouvelAppel : un appel arrivé
// depuis la dernière lecture (son, mise en évidence).
// etat : chargement | valid | revoked | unavailable | unknown ; connexion : en_ligne | reconnexion.
export function useEcranAppel(jeton, surNouvelAppel) {
  const [etat, setEtat] = useState('chargement')
  const [infos, setInfos] = useState(null)
  const [appels, setAppels] = useState([])
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
    }
  }, [jeton, recevoir])

  // Première lecture.
  useEffect(() => {
    const premier = setTimeout(relire, 0)
    return () => clearTimeout(premier)
  }, [relire])

  // Canal Broadcast (une fois le lien reconnu) : rouvert après une coupure ; relecture à
  // chaque (re)connexion pour rattraper les appels manqués pendant la coupure. Écran
  // retiré : canal fermé et plus aucune lecture.
  const valide = Boolean(topic) && etat === 'valid'
  const ouvrir = useCallback(
    (surEtat) =>
      ecouterEcran(topic, {
        surAppel: (appel) => recevoir([appel]),
        surRetrait: () => setEtat('revoked'),
        surEtat,
      }),
    [topic, recevoir],
  )
  const abonne = useCanalSecours(valide ? ouvrir : null, relire, {
    actif: etat !== 'revoked',
    toujours: true,
  })

  return { etat, infos, appels, connexion: valide && abonne ? 'en_ligne' : 'reconnexion' }
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
