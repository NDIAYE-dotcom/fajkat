import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { deconnecter as fermerSession, ecouterSession } from '../lib/auth.js'
import { fermerBrouillons, ouvrirBrouillons } from '../lib/brouillons.js'
import { AuthContexte } from './authContexte.js'

// Session de récupération (lien « mot de passe oublié ») : gardée pour l'onglet, afin
// qu'un rechargement de /reinitialiser ne fasse pas perdre le formulaire.
const CLE_RECUPERATION = 'fajkat.recuperation'

function lireRecuperation() {
  try {
    return sessionStorage.getItem(CLE_RECUPERATION) === '1'
  } catch {
    return false
  }
}

function ecrireRecuperation(active) {
  try {
    if (active) sessionStorage.setItem(CLE_RECUPERATION, '1')
    else sessionStorage.removeItem(CLE_RECUPERATION)
  } catch {
    // Stockage indisponible : l'état reste en mémoire pour cet affichage.
  }
}

// Session Supabase de l'utilisateur. initialise passe à true une fois la session
// relue depuis le navigateur (ou depuis un lien reçu par e-mail).
export function AuthProvider({ children }) {
  const queryClient = useQueryClient()
  const [etat, setEtat] = useState({ session: null, initialise: false })
  // Arrivée par le lien « mot de passe oublié » : la page /reinitialiser s'ouvre.
  const [recuperation, setRecuperation] = useState(lireRecuperation)
  // Compte connecté : ses brouillons sont verrouillés dès le début de sa déconnexion.
  const compte = useRef(null)

  useEffect(
    () =>
      ecouterSession((evenement, session) => {
        if (session?.user && ['INITIAL_SESSION', 'SIGNED_IN'].includes(evenement)) {
          compte.current = session.user.id
          ouvrirBrouillons(session.user.id)
        }
        if (evenement === 'PASSWORD_RECOVERY') {
          ecrireRecuperation(true)
          setRecuperation(true)
        }
        // Déconnexion ici ou dans un autre onglet, session expirée : on ne laisse
        // ni brouillon de patient ni donnée en cache sur l'appareil.
        if (evenement === 'SIGNED_OUT') {
          ecrireRecuperation(false)
          setRecuperation(false)
          fermerBrouillons(compte.current)
          queryClient.clear()
        }
        setEtat({ session, initialise: true })
      }),
    [queryClient],
  )

  const deconnecter = useCallback(async () => {
    // Avant tout : plus aucun brouillon ne s'écrit, même si la page se ferme pendant
    // la déconnexion (sauvegarde immédiate de useBrouillon).
    fermerBrouillons(compte.current)
    const fermee = await fermerSession()
    fermerBrouillons(compte.current)
    queryClient.clear()
    // Hors ligne, la session a été effacée à la main : on recharge pour repartir de zéro.
    if (!fermee) window.location.assign('/connexion')
  }, [queryClient])

  const debutRecuperation = useCallback(() => {
    ecrireRecuperation(true)
    setRecuperation(true)
  }, [])

  const finRecuperation = useCallback(() => {
    ecrireRecuperation(false)
    setRecuperation(false)
  }, [])

  const valeur = useMemo(() => {
    const utilisateur = etat.session?.user ?? null
    const nomComplet = utilisateur?.user_metadata?.full_name?.trim() ?? ''
    return {
      session: etat.session,
      initialise: etat.initialise,
      utilisateur,
      nomComplet,
      prenom: nomComplet.split(/\s+/)[0] ?? '',
      recuperation,
      debutRecuperation,
      finRecuperation,
      deconnecter,
    }
  }, [etat, recuperation, debutRecuperation, finRecuperation, deconnecter])

  return <AuthContexte.Provider value={valeur}>{children}</AuthContexte.Provider>
}
