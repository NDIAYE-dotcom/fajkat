import { createBrowserRouter } from 'react-router-dom'
import PublicLayout from '../components/layout/PublicLayout/PublicLayout.jsx'
import NonTrouve from '../pages/NonTrouve/NonTrouve.jsx'
import Landing from '../pages/public/Landing/Landing.jsx'

// Pages secondaires chargées à la demande : la page d'accueil reste légère sur les petits téléphones.
const pageLegale = (document) => async () => {
  const { default: PageLegale } = await import('../pages/public/Legal/PageLegale/PageLegale.jsx')
  return { element: <PageLegale document={document} /> }
}

const composant = (importer) => async () => ({ Component: (await importer()).default })

export const router = createBrowserRouter([
  {
    element: <PublicLayout />,
    children: [
      // L'accueil (écran de choix) et les deux pages d'offre partagent le même composant :
      // l'offre affichée se déduit de l'adresse.
      { path: '/', element: <Landing /> },
      { path: '/poste-de-sante', element: <Landing /> },
      { path: '/clinique', element: <Landing /> },
      { path: '/mentions-legales', lazy: pageLegale('mentions') },
      { path: '/confidentialite', lazy: pageLegale('confidentialite') },
      { path: '/cgu', lazy: pageLegale('cgu') },
    ],
  },
  { path: '/connexion', lazy: composant(() => import('../pages/public/Connexion/Connexion.jsx')) },
  {
    path: '/inscription',
    lazy: composant(() => import('../pages/public/Inscription/Inscription.jsx')),
  },
  {
    path: '/app',
    lazy: composant(() => import('../modules/admin/pages/TableauDeBord/TableauDeBord.jsx')),
  },
  { path: '*', element: <NonTrouve /> },
])
