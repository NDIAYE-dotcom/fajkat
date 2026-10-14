import { Outlet } from 'react-router-dom'
import ModuleNonInclus from '../../../components/layout/ModuleNonInclus/ModuleNonInclus.jsx'
import { useOrganization } from '../../../hooks/useOrganization.js'

// Garde de rôle : un rôle non autorisé voit pourquoi, et à qui s'adresser.
export default function RoleRoute({ roles, libelle, children }) {
  const { role } = useOrganization()
  if (!roles.includes(role)) return <ModuleNonInclus libelle={libelle} raison="role" />
  return children ?? <Outlet />
}
