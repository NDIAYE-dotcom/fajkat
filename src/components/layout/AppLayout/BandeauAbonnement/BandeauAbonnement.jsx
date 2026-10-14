import { ArrowRight, CircleAlert, Info, TriangleAlert } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { useOrganization } from '../../../../hooks/useOrganization.js'
import { bandeauAbonnement } from '../../../../lib/abonnement.js'
import { ROLES_ABONNEMENT } from '../../../../router/navigation.js'
import Button from '../../../ui/Button/Button.jsx'
import Icone from '../../../ui/Icone/Icone.jsx'
import './BandeauAbonnement.css'

const ICONES = { info: Info, attention: TriangleAlert, erreur: CircleAlert }

// Bandeau selon organizations.status : essai, période de grâce, lecture seule, suspension.
// Rien quand l'abonnement est actif. La logique réelle arrive à l'étape 10.
export default function BandeauAbonnement() {
  const { structure, role } = useOrganization()
  const { pathname } = useLocation()
  const bandeau = bandeauAbonnement(structure)
  if (!bandeau) return null

  const action = ROLES_ABONNEMENT.includes(role) && pathname !== '/app/abonnement'

  return (
    <div className={`bandeau-abonnement bandeau-abonnement--${bandeau.ton}`} role="status">
      <Icone icone={ICONES[bandeau.ton]} className="bandeau-abonnement__icone" />
      <p className="bandeau-abonnement__texte">
        <strong className="bandeau-abonnement__titre">{bandeau.titre}.</strong> {bandeau.texte}
      </p>
      {action && (
        <Button
          to="/app/abonnement"
          variante="discret"
          iconeFin={<Icone icone={ArrowRight} />}
          className="bandeau-abonnement__action"
        >
          {structure.status === 'trial' ? 'Mon abonnement' : 'Renouveler'}
        </Button>
      )}
    </div>
  )
}
