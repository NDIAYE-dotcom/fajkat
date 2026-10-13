import { createBrowserRouter } from 'react-router-dom'
import TableauDeBord from '../modules/admin/pages/TableauDeBord/TableauDeBord.jsx'
import NonTrouve from '../pages/NonTrouve/NonTrouve.jsx'
import Connexion from '../pages/public/Connexion/Connexion.jsx'
import Inscription from '../pages/public/Inscription/Inscription.jsx'
import Landing from '../pages/public/Landing/Landing.jsx'

export const router = createBrowserRouter([
  { path: '/', element: <Landing /> },
  { path: '/connexion', element: <Connexion /> },
  { path: '/inscription', element: <Inscription /> },
  { path: '/app', element: <TableauDeBord /> },
  { path: '*', element: <NonTrouve /> },
])
