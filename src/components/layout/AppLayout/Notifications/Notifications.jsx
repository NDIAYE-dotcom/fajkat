import { Bell } from 'lucide-react'
import Icone from '../../../ui/Icone/Icone.jsx'
import MenuDeroulant from '../MenuDeroulant/MenuDeroulant.jsx'
import './Notifications.css'

// Cloche des notifications : vide pour l'instant. Les alertes de stock, de rendez-vous
// et de paiement y arriveront avec leurs modules.
export default function Notifications() {
  return (
    <MenuDeroulant
      libelle="Notifications"
      declencheur={({ attributs }) => (
        <button
          type="button"
          className="notifications__bouton"
          aria-label="Notifications"
          {...attributs}
        >
          <Icone icone={Bell} />
        </button>
      )}
    >
      {() => (
        <div className="notifications__panneau">
          <p className="notifications__titre">Notifications</p>
          <p className="notifications__vide">Aucune notification pour l’instant.</p>
          <p className="notifications__texte">
            Les ruptures de stock, les rendez-vous manqués et les échéances de paiement
            s’afficheront ici.
          </p>
        </div>
      )}
    </MenuDeroulant>
  )
}
