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
  // Pages qui ont besoin de la session : fournisseurs Auth / Org chargés à la demande.
  {
    lazy: composant(() => import('./RacineSession.jsx')),
    children: [
      {
        lazy: composant(() => import('../components/layout/AuthLayout/AuthLayout.jsx')),
        children: [
          {
            path: '/connexion',
            lazy: composant(() => import('../pages/public/Connexion/Connexion.jsx')),
          },
          {
            path: '/inscription',
            lazy: composant(() => import('../pages/public/Inscription/Inscription.jsx')),
          },
          {
            path: '/mot-de-passe-oublie',
            lazy: composant(() => import('../pages/public/MotDePasseOublie/MotDePasseOublie.jsx')),
          },
          {
            path: '/auth/confirmer',
            lazy: composant(() => import('../pages/public/ConfirmerLien/ConfirmerLien.jsx')),
          },
          {
            path: '/reinitialiser',
            lazy: composant(() => import('../pages/public/Reinitialiser/Reinitialiser.jsx')),
          },
        ],
      },
      // /app/* : session ET structure active exigées (RequireAuth).
      {
        path: '/app',
        lazy: composant(() => import('./guards/RequireAuth/RequireAuth.jsx')),
        children: [
          // Assistant de démarrage : plein écran, hors de la coquille.
          {
            path: 'demarrage',
            lazy: composant(() => import('../modules/admin/pages/Demarrage/Demarrage.jsx')),
          },
          {
            lazy: composant(() => import('../components/layout/AppLayout/AppLayout.jsx')),
            children: [
              {
                index: true,
                lazy: composant(
                  () => import('../modules/admin/pages/TableauDeBord/TableauDeBord.jsx'),
                ),
              },
              {
                path: 'parametres',
                lazy: composant(() => import('../modules/admin/pages/Parametres/Parametres.jsx')),
              },
              {
                path: 'abonnement',
                lazy: composant(() => import('../modules/admin/pages/Abonnement/Abonnement.jsx')),
              },
              { path: 'profil', lazy: composant(() => import('../pages/Profil/Profil.jsx')) },
              // Modules sans page dédiée : gardes d'offre et de rôle, puis « en préparation »
              // (navigation.js). Les modules construits ensuite ajoutent leur route ici.
              { path: '*', lazy: composant(() => import('./RouteModule.jsx')) },
            ],
          },
        ],
      },
    ],
  },
  // Vitrine du design system de l'application : accessible, non indexée (noindex, hors sitemap).
  { path: '/atelier', lazy: composant(() => import('../pages/Atelier/Atelier.jsx')) },
  { path: '*', element: <NonTrouve /> },
])
