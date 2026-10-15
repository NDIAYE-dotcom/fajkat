import { useQuery } from '@tanstack/react-query'
import { chargerPermissions, cles } from '../api.js'

// Droits de l'utilisateur sur le registre de la structure. Tant qu'ils ne sont pas
// chargés, tout vaut false : un bouton non confirmé n'apparaît pas.
export function usePermissionsPatients(orgId) {
  const requete = useQuery({
    queryKey: cles.permissions(orgId),
    queryFn: () => chargerPermissions(orgId),
    enabled: Boolean(orgId),
    staleTime: 5 * 60 * 1000,
  })
  const droits = requete.data ?? {}
  return {
    lire: Boolean(droits.read),
    ecrire: Boolean(droits.write),
    medical: Boolean(droits.medical),
    fusionner: Boolean(droits.merge),
    importer: Boolean(droits.import),
    chargement: requete.isPending,
  }
}
