import { Outlet } from 'react-router-dom'
import { OffreProvider } from '../../../context/OffreContext.jsx'
import EnTete from '../../../pages/public/Landing/EnTete/EnTete.jsx'
import PiedDePage from '../../../pages/public/Landing/PiedDePage/PiedDePage.jsx'

// Cadre commun des pages publiques (accueil, pages d'offre, pages légales) :
// l'offre affichée se lit dans l'adresse, l'en-tête et le pied de page restent en place.
export default function PublicLayout() {
  return (
    <OffreProvider>
      <EnTete />
      <Outlet />
      <PiedDePage />
    </OffreProvider>
  )
}
