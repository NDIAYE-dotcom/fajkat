import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

// Envoi d'un réglage depuis une liste : une seule action à la fois (occupe = clé de la
// ligne), erreur gardée jusqu'à la prochaine action, liste relue après un succès.
// La saisie n'est jamais perdue : le formulaire reste ouvert tant que l'envoi échoue.
export function useActionReglage(cleRequete) {
  const queryClient = useQueryClient()
  const [occupe, setOccupe] = useState(null)
  const [erreur, setErreur] = useState(null)

  async function agir(cle, action) {
    setOccupe(cle)
    setErreur(null)
    try {
      const resultat = await action()
      await queryClient.invalidateQueries({ queryKey: cleRequete })
      return { ok: true, resultat }
    } catch (e) {
      setErreur(e.message)
      return { ok: false }
    } finally {
      setOccupe(null)
    }
  }

  return { agir, occupe, erreur, effacerErreur: () => setErreur(null) }
}
