import Avatar from '../../../ui/Avatar/Avatar.jsx'
import './LogoStructure.css'

// Logo de la structure (logo_url, bucket public « logos »), ou ses initiales à défaut.
// Décoratif : le nom de la structure est toujours écrit à côté.
export default function LogoStructure({ structure }) {
  if (structure.logo_url) {
    return <img className="logo-structure" src={structure.logo_url} alt="" width="36" height="36" />
  }
  return <Avatar nom={structure.name} taille="s" decoratif className="logo-structure" />
}
