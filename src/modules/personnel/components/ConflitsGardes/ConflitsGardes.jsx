import { useQuery } from '@tanstack/react-query'
import Message from '../../../../components/ui/Message/Message.jsx'
import { chargerConflits, cles } from '../../api.js'
import { formatJour } from '../../utils.js'

// Gardes prévues pendant un congé : signalées, jamais bloquantes (le responsable
// réorganise le planning). vous : formulation pour la personne elle-même.
export default function ConflitsGardes({ orgId, membreId, debut, fin, vous = false }) {
  const conflits = useQuery({
    queryKey: cles.conflits(orgId, membreId, debut, fin),
    queryFn: () => chargerConflits(orgId, membreId, debut, fin),
    enabled: Boolean(membreId && debut && fin && debut <= fin),
  })
  if (!conflits.data?.length) return null
  const liste = conflits.data
    .map((c) => `${c.shift_label} le ${formatJour(c.shift_date)}`)
    .join(', ')
  return (
    <Message ton="erreur" titre="Conflit avec le planning">
      <p>
        {vous
          ? 'Vous êtes de garde pendant ce congé'
          : 'Cette personne est de garde pendant ce congé'}{' '}
        : {liste}.{' '}
        {vous
          ? 'Le responsable verra ce conflit en traitant votre demande.'
          : 'Pensez à la remplacer dans le planning.'}
      </p>
    </Message>
  )
}
