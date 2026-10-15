import { History } from 'lucide-react'
import EmptyState from '../../../../components/ui/EmptyState/EmptyState.jsx'

// Consultations, vaccins, paiements : branchés par les modules des étapes suivantes.
export default function OngletHistorique() {
  return (
    <EmptyState
      icone={History}
      titre="Aucun historique pour l’instant"
      texte="Les consultations, les vaccins et les paiements de ce patient apparaîtront ici."
    />
  )
}
