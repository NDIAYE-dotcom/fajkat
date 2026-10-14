import IndicateurConnexion from '../IndicateurConnexion/IndicateurConnexion.jsx'
import MenuUtilisateur from '../MenuUtilisateur/MenuUtilisateur.jsx'
import Notifications from '../Notifications/Notifications.jsx'
import RechercheGlobale from '../RechercheGlobale/RechercheGlobale.jsx'
import SelecteurStructure from '../SelecteurStructure/SelecteurStructure.jsx'
import './EnTete.css'

// En-tête de l'application : structure, recherche, connexion, notifications, compte.
// recherche : false si le rôle ou l'offre ne donne pas accès aux patients.
export default function EnTete({ recherche }) {
  return (
    <header className="en-tete">
      <SelecteurStructure />
      <div className="en-tete__outils">
        {recherche && <RechercheGlobale />}
        <IndicateurConnexion />
        <Notifications />
        <MenuUtilisateur />
      </div>
    </header>
  )
}
