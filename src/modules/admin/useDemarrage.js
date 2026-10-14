import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo } from 'react'
import { useAuth } from '../../hooks/useAuth.js'
import { useOrganization } from '../../hooks/useOrganization.js'
import { cleStructures } from '../../lib/structures.js'
import { majReglages } from './api.js'
import { CODES_ETAPES, lireOnboarding, progression } from './utils.js'

// Progression de l'assistant de démarrage de la structure active.
// const { onboarding, avancement, marquer, enregistrerReglages } = useDemarrage()
export function useDemarrage() {
  const { utilisateur } = useAuth()
  const { structure } = useOrganization()
  const queryClient = useQueryClient()
  const orgId = structure?.id
  const userId = utilisateur?.id

  const onboarding = useMemo(() => lireOnboarding(structure?.settings), [structure?.settings])
  const avancement = progression(onboarding)

  // Les réglages renvoyés par la base remplacent ceux de la structure en cache :
  // la carte du tableau de bord est à jour sans nouveau chargement.
  const enregistrerReglages = useCallback(
    async (patch) => {
      const settings = await majReglages(orgId, patch)
      queryClient.setQueryData(cleStructures(userId), (liste) =>
        liste?.map((s) => (s.id === orgId ? { ...s, settings } : s)),
      )
      return settings
    },
    [orgId, userId, queryClient],
  )

  // statut : 'faite' | 'passee'. Passer un écran déjà fait ne le défait pas.
  // options.onboarding : clés ajoutées à onboarding (equipe_seul…) ;
  // options.reglages : autres clés de settings enregistrées en même temps (opening_hours).
  const marquer = useCallback(
    (code, statut, options = {}) => {
      const etapes = { ...onboarding.etapes }
      if (!(statut === 'passee' && etapes[code] === 'faite')) etapes[code] = statut
      const suivant = { ...onboarding, ...options.onboarding, etapes }
      suivant.vu_le ??= new Date().toISOString()
      const tout = CODES_ETAPES.every((c) => etapes[c] === 'faite')
      if (tout && !suivant.termine_le) suivant.termine_le = new Date().toISOString()
      return enregistrerReglages({ ...options.reglages, onboarding: suivant })
    },
    [onboarding, enregistrerReglages],
  )

  return { onboarding, avancement, marquer, enregistrerReglages }
}
