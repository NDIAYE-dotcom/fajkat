import { Lock } from 'lucide-react'
import Button from '../../../../components/ui/Button/Button.jsx'
import EmptyState from '../../../../components/ui/EmptyState/EmptyState.jsx'

// Rôle qui ne lit pas les consultations (owner ou admin qui n'exerce pas) : aucune
// requête n'est faite, rien du contenu n'arrive sur l'appareil.
export default function ReserveAuxSoignants({
  titre = 'Les consultations sont réservées aux soignants',
  texte = 'Le contenu des consultations est couvert par le secret médical.',
}) {
  return (
    <EmptyState
      niveau={1}
      icone={Lock}
      titre={titre}
      texte={`${texte} Si vous exercez une profession soignante, l’owner peut l’indiquer sur votre fiche dans Personnel.`}
      action={<Button to="/app">Retour à la journée</Button>}
    />
  )
}
