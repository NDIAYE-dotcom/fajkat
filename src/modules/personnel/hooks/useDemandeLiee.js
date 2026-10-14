import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { chargerConge, cles } from '../api.js'

// Demande de congé désignée par l'adresse (?demande=<id>, lien d'une notification).
// Cherchée d'abord dans la liste déjà chargée, sinon lue seule (demande plus ancienne).
// fermer() retire le paramètre de l'adresse sans ajouter d'entrée à l'historique.
export function useDemandeLiee(orgId, liste) {
  const [parametres, setParametres] = useSearchParams()
  const demandeId = parametres.get('demande')
  const trouvee = demandeId ? liste?.find((c) => c.id === demandeId) : null

  const seule = useQuery({
    queryKey: cles.conge(orgId, demandeId),
    queryFn: () => chargerConge(orgId, demandeId),
    enabled: Boolean(demandeId) && Boolean(liste) && !trouvee,
  })

  function fermer() {
    setParametres(
      (actuels) => {
        const suivants = new URLSearchParams(actuels)
        suivants.delete('demande')
        return suivants
      },
      { replace: true },
    )
  }

  return {
    conge: trouvee ?? seule.data ?? null,
    introuvable: Boolean(demandeId) && !trouvee && seule.isSuccess && !seule.data,
    erreur: demandeId && !trouvee ? seule.error : null,
    fermer,
  }
}
