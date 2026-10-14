import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../hooks/useAuth.js'
import { rafraichirSession } from '../lib/auth.js'
import { setFuseauHoraire } from '../lib/format.js'
import { chargerStructures, cleStructures, finaliserStructureEnAttente } from '../lib/structures.js'
import { OrgContexte } from './orgContexte.js'

// Dernière structure ouverte, par utilisateur : un même téléphone peut servir à plusieurs
// comptes, et un même compte à plusieurs structures.
const PREFIXE_DERNIERE = 'fajkat.structure.'

function lireDerniere(userId) {
  if (!userId) return null
  try {
    return localStorage.getItem(PREFIXE_DERNIERE + userId)
  } catch {
    return null
  }
}

function memoriserDerniere(userId, orgId) {
  try {
    localStorage.setItem(PREFIXE_DERNIERE + userId, orgId)
  } catch {
    // Stockage indisponible : la première structure de la liste sera ouverte la prochaine fois.
  }
}

// Structure active de l'utilisateur connecté, et liste de ses structures.
export function OrgProvider({ children }) {
  const { utilisateur } = useAuth()
  const userId = utilisateur?.id ?? null
  const queryClient = useQueryClient()

  // Structure saisie à l'inscription mais pas encore créée (e-mail à confirmer d'abord) :
  // elle est créée ici, une seule fois, avant de charger la liste.
  const enAttente = Boolean(utilisateur?.user_metadata?.pending_organization)
  const finalisation = useQuery({
    queryKey: ['finalisation', userId],
    queryFn: async () => {
      const id = await finaliserStructureEnAttente()
      // Les métadonnées de la session sont relues pour oublier la demande traitée.
      await rafraichirSession().catch(() => {})
      return id
    },
    enabled: Boolean(userId) && enAttente,
    staleTime: Infinity,
    gcTime: Infinity,
  })
  const finalisationEnCours = enAttente && finalisation.isPending

  const requete = useQuery({
    queryKey: cleStructures(userId),
    queryFn: () => chargerStructures(userId),
    enabled: Boolean(userId) && !finalisationEnCours,
  })

  const [choix, setChoix] = useState(null)
  const structures = useMemo(() => requete.data ?? [], [requete.data])
  const idVoulu = choix?.userId === userId ? choix.id : lireDerniere(userId)
  const structure = structures.find((s) => s.id === idVoulu) ?? structures[0] ?? null

  // Dates et heures affichées dans le fuseau de la structure active.
  useEffect(() => {
    setFuseauHoraire(structure?.timezone)
  }, [structure?.timezone])

  const changerStructure = useCallback(
    (orgId) => {
      if (!userId) return
      memoriserDerniere(userId, orgId)
      setChoix({ userId, id: orgId })
    },
    [userId],
  )

  // Après une création depuis /inscription : la nouvelle structure devient active.
  const structureCreee = useCallback(
    async (orgId) => {
      changerStructure(orgId)
      await queryClient.refetchQueries({ queryKey: cleStructures(userId) })
    },
    [changerStructure, queryClient, userId],
  )

  const recharger = useCallback(() => {
    if (finalisation.isError) finalisation.refetch()
    requete.refetch()
  }, [finalisation, requete])

  const valeur = useMemo(
    () => ({
      structure,
      structures,
      role: structure?.role ?? null,
      chargement: Boolean(userId) && (finalisationEnCours || requete.isPending),
      erreur: requete.error,
      erreurFinalisation: finalisation.error,
      changerStructure,
      structureCreee,
      recharger,
    }),
    [
      structure,
      structures,
      userId,
      finalisationEnCours,
      requete.isPending,
      requete.error,
      finalisation.error,
      changerStructure,
      structureCreee,
      recharger,
    ],
  )

  return <OrgContexte.Provider value={valeur}>{children}</OrgContexte.Provider>
}
