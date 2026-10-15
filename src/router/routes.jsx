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
          // Lien d'invitation reçu sur WhatsApp ou par e-mail.
          {
            path: '/invitation/:jeton',
            lazy: composant(() => import('../pages/public/Invitation/Invitation.jsx')),
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
              {
                path: 'personnel',
                lazy: composant(() => import('../modules/personnel/pages/Personnel/Personnel.jsx')),
              },
              {
                path: 'patients',
                lazy: composant(() => import('../modules/patients/pages/Patients/Patients.jsx')),
              },
              // Import d'une liste de patients (Excel ou CSV) : owner et admin.
              {
                path: 'patients/import',
                lazy: composant(
                  () => import('../modules/patients/pages/ImportPatients/ImportPatients.jsx'),
                ),
              },
              // Page de registre papier recopiée : rôles qui créent un patient.
              {
                path: 'patients/registre',
                lazy: composant(
                  () => import('../modules/patients/pages/RegistrePapier/RegistrePapier.jsx'),
                ),
              },
              // Fiche d'un patient : lien du registre, de la recherche et du QR de la carte.
              {
                path: 'patients/:id',
                lazy: composant(
                  () => import('../modules/patients/pages/FichePatient/FichePatient.jsx'),
                ),
              },
              // Accueil du jour : arrivées, tickets de file.
              {
                path: 'file-attente',
                lazy: composant(
                  () => import('../modules/accueil/pages/FileAttente/FileAttente.jsx'),
                ),
              },
              // Tickets de consultation des postes de santé : vente, bilan, gratuités.
              {
                path: 'tickets',
                lazy: composant(
                  () =>
                    import('../modules/accueil/pages/TicketsConsultation/TicketsConsultation.jsx'),
                ),
              },
              {
                path: 'mon-espace',
                lazy: composant(() => import('../modules/personnel/pages/MonEspace/MonEspace.jsx')),
              },
              // Modules sans page dédiée : gardes d'offre et de rôle, puis « en préparation »
              // (navigation.js). Les modules construits ensuite ajoutent leur route ici.
              { path: '*', lazy: composant(() => import('./RouteModule.jsx')) },
            ],
          },
        ],
      },
    ],
  },
  // Suivi d'un ticket de file, ouvert par le QR imprimé : sans connexion, non indexé.
  {
    path: '/ticket/:code',
    lazy: composant(() => import('../pages/public/SuiviTicket/SuiviTicket.jsx')),
  },
  // Écran d'appel de la salle d'attente (télévision), ouvert par un lien à jeton : sans
  // connexion, non indexé.
  {
    path: '/ecran/:jeton',
    lazy: composant(() => import('../pages/public/EcranAppel/EcranAppel.jsx')),
  },
  // Vitrine du design system de l'application : accessible, non indexée (noindex, hors sitemap).
  { path: '/atelier', lazy: composant(() => import('../pages/Atelier/Atelier.jsx')) },
  { path: '*', element: <NonTrouve /> },
])
