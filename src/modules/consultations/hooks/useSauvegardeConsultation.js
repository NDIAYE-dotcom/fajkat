import { useCallback, useContext, useEffect, useRef, useState } from 'react'
import { AuthContexte } from '../../../context/authContexte.js'
import { OrgContexte } from '../../../context/orgContexte.js'
import { cleBrouillon, peutEcrireBrouillon } from '../../../lib/brouillons.js'
import { chargerConsultation, enregistrerBrouillon, validerConsultation } from '../api.js'
import { cleLocale, memeContenu, normaliser } from '../utils.js'

// Envoi au serveur toutes les 10 secondes ; copie sur l'appareil peu après chaque frappe.
const INTERVALLE_SERVEUR = 10 * 1000
const DELAI_LOCAL = 400

// Copie locale : { contenu, version, modifie, date }. Clé propre à l'utilisateur et à la
// structure (fajkat.brouillon.<utilisateur>.<structure>.consultation.<id>), effacée à la
// déconnexion avec les autres brouillons. localStorage peut manquer : jamais d'exception.
export function lireCopieLocale(cle) {
  try {
    const brut = localStorage.getItem(cle)
    return brut ? JSON.parse(brut) : null
  } catch {
    return null
  }
}

function ecrireCopieLocale(cle, copie, utilisateurId) {
  if (!peutEcrireBrouillon(utilisateurId)) return false
  try {
    localStorage.setItem(cle, JSON.stringify(copie))
    return true
  } catch {
    return false
  }
}

export function supprimerCopieLocale(cle) {
  try {
    localStorage.removeItem(cle)
  } catch {
    // stockage indisponible : rien à effacer
  }
}

export function useCleLocale(id) {
  const auth = useContext(AuthContexte)
  const org = useContext(OrgContexte)
  const [portee] = useState(() => ({
    utilisateurId: auth?.utilisateur?.id ?? null,
    structureId: org?.structure?.id ?? null,
  }))
  return { cle: cleBrouillon(cleLocale(id), portee), utilisateurId: portee.utilisateurId }
}

// Point de départ : la copie locale non envoyée l'emporte si elle repose sur la version
// du serveur ; si le serveur a changé entre-temps (autre appareil), rien n'est choisi
// à la place du soignant : conflit à trancher.
function depart(copie, consultation) {
  const serveur = normaliser(consultation.draft_data)
  const sansCopie = {
    contenu: serveur,
    modifie: false,
    conflit: null,
  }
  if (!copie?.modifie) return sansCopie
  const local = normaliser(copie.contenu)
  if (memeContenu(local, serveur)) return sansCopie
  if (copie.version === consultation.version) {
    return { contenu: local, modifie: true, conflit: null }
  }
  return {
    contenu: local,
    modifie: true,
    conflit: {
      local: { contenu: local, date: copie.date },
      serveur: { contenu: serveur, version: consultation.version, date: consultation.updated_at },
    },
  }
}

// Brouillon d'une consultation tenue par l'utilisateur. Coupure de courant ou de réseau :
// la saisie reste sur l'appareil et part au retour de la connexion ; rien n'est écrasé
// sans un choix explicite (conflit avec un autre appareil).
//   etat : a_jour | modifie | envoi | hors_ligne | erreur | conflit | reprise
export function useSauvegardeConsultation(consultation) {
  const { cle, utilisateurId } = useCleLocale(consultation.id)
  const [initial] = useState(() => depart(lireCopieLocale(cle), consultation))
  const [contenu, setContenuEtat] = useState(initial.contenu)
  const [etat, setEtat] = useState(
    initial.conflit ? 'conflit' : initial.modifie ? 'modifie' : 'a_jour',
  )
  const [erreur, setErreur] = useState(null)
  const [conflit, setConflit] = useState(initial.conflit)
  const [serveurA, setServeurA] = useState(consultation.updated_at)
  const [localA, setLocalA] = useState(null)
  const [sensible, setSensible] = useState(Boolean(consultation.is_sensitive))

  const versionRef = useRef(consultation.version)
  const contenuRef = useRef(initial.contenu)
  const modifieRef = useRef(initial.modifie)
  const envoiRef = useRef(false)
  // Conflit ou consultation reprise par un collègue : plus aucun envoi automatique.
  const bloqueRef = useRef(Boolean(initial.conflit))
  const minuteurLocal = useRef(null)

  const ecrireLocal = useCallback(() => {
    clearTimeout(minuteurLocal.current)
    const date = new Date().toISOString()
    const ok = ecrireCopieLocale(
      cle,
      {
        contenu: contenuRef.current,
        version: versionRef.current,
        modifie: modifieRef.current,
        date,
      },
      utilisateurId,
    )
    if (ok && modifieRef.current) setLocalA(date)
  }, [cle, utilisateurId])

  const setContenu = useCallback(
    (maj) => {
      setContenuEtat((avant) => {
        const suivant = typeof maj === 'function' ? maj(avant) : maj
        contenuRef.current = suivant
        return suivant
      })
      modifieRef.current = true
      if (!bloqueRef.current) setEtat((e) => (e === 'envoi' ? e : 'modifie'))
      clearTimeout(minuteurLocal.current)
      minuteurLocal.current = setTimeout(ecrireLocal, DELAI_LOCAL)
    },
    [ecrireLocal],
  )

  // Envoi au serveur ; renvoie true si le serveur a la dernière saisie.
  const envoyer = useCallback(async () => {
    if (bloqueRef.current) return false
    if (!modifieRef.current) return true
    if (envoiRef.current) return false
    envoiRef.current = true
    setEtat('envoi')
    const envoye = contenuRef.current
    try {
      const r = await enregistrerBrouillon(consultation.id, versionRef.current, envoye)
      versionRef.current = r.version
      if (contenuRef.current === envoye) modifieRef.current = false
      setServeurA(r.saved_at)
      setSensible(Boolean(r.is_sensitive))
      setErreur(null)
      setEtat(modifieRef.current ? 'modifie' : 'a_jour')
      ecrireLocal()
      return !modifieRef.current
    } catch (e) {
      if (e.conflit) {
        bloqueRef.current = true
        setEtat('conflit')
        ecrireLocal()
        try {
          const serveur = await chargerConsultation(consultation.id)
          setConflit({
            local: { contenu: contenuRef.current, date: new Date().toISOString() },
            serveur: {
              contenu: normaliser(serveur.draft_data),
              version: serveur.version,
              date: serveur.updated_at,
              mine: serveur.mine,
              auteur: serveur.author_name,
              statut: serveur.status,
            },
          })
        } catch (lecture) {
          setErreur(lecture.message)
        }
      } else if (e.code === '42501') {
        // Reprise par un collègue (ou droits retirés) : la saisie reste sur l'appareil.
        bloqueRef.current = true
        setErreur(e.message)
        setEtat('reprise')
        ecrireLocal()
      } else {
        setErreur(e.message)
        setEtat(e.reseau ? 'hors_ligne' : 'erreur')
      }
      return false
    } finally {
      envoiRef.current = false
    }
  }, [consultation.id, ecrireLocal])

  // Toutes les 10 secondes, au retour du réseau, et quand l'onglet passe en arrière-plan
  // (le téléphone se met en veille, la batterie peut lâcher).
  const envoyerRef = useRef(envoyer)
  useEffect(() => {
    envoyerRef.current = envoyer
  })
  useEffect(() => {
    const minuteur = setInterval(() => {
      if (navigator.onLine) envoyerRef.current()
    }, INTERVALLE_SERVEUR)
    function surReseau() {
      envoyerRef.current()
    }
    function surVisibilite() {
      if (document.visibilityState === 'hidden') {
        if (modifieRef.current) ecrireLocal()
        if (navigator.onLine) envoyerRef.current()
      }
    }
    function surFermeture() {
      if (modifieRef.current) ecrireLocal()
    }
    window.addEventListener('online', surReseau)
    document.addEventListener('visibilitychange', surVisibilite)
    window.addEventListener('pagehide', surFermeture)
    return () => {
      clearInterval(minuteur)
      window.removeEventListener('online', surReseau)
      document.removeEventListener('visibilitychange', surVisibilite)
      window.removeEventListener('pagehide', surFermeture)
      if (modifieRef.current) ecrireLocal()
    }
  }, [ecrireLocal])

  // Conflit tranché par le soignant.
  const garderServeur = useCallback(() => {
    if (!conflit) return
    contenuRef.current = conflit.serveur.contenu
    versionRef.current = conflit.serveur.version
    modifieRef.current = false
    bloqueRef.current = false
    setContenuEtat(conflit.serveur.contenu)
    setServeurA(conflit.serveur.date)
    setConflit(null)
    setErreur(null)
    setEtat('a_jour')
    ecrireLocal()
  }, [conflit, ecrireLocal])

  const garderLocal = useCallback(() => {
    if (!conflit) return
    versionRef.current = conflit.serveur.version
    modifieRef.current = true
    bloqueRef.current = false
    setConflit(null)
    setErreur(null)
    setEtat('modifie')
    ecrireLocal()
    envoyerRef.current()
  }, [conflit, ecrireLocal])

  // Validation : la dernière saisie part d'abord au serveur, puis la consultation est
  // figée ; la copie locale n'a plus lieu d'être.
  const valider = useCallback(async () => {
    if (modifieRef.current && !(await envoyer())) {
      throw new Error(
        'La dernière saisie n’a pas pu être enregistrée sur le serveur. Vérifiez la connexion, puis validez de nouveau.',
      )
    }
    const resultat = await validerConsultation(consultation.id, versionRef.current)
    bloqueRef.current = true
    modifieRef.current = false
    clearTimeout(minuteurLocal.current)
    supprimerCopieLocale(cle)
    return resultat
  }, [cle, consultation.id, envoyer])

  const effacerLocal = useCallback(() => {
    bloqueRef.current = true
    modifieRef.current = false
    clearTimeout(minuteurLocal.current)
    supprimerCopieLocale(cle)
  }, [cle])

  return {
    contenu,
    setContenu,
    etat,
    erreur,
    conflit,
    serveurA,
    localA,
    sensible,
    envoyer,
    garderServeur,
    garderLocal,
    valider,
    effacerLocal,
    versionActuelle: () => versionRef.current,
  }
}
