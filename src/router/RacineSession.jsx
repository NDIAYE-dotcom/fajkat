import { Outlet } from 'react-router-dom'
import { AuthProvider } from '../context/AuthContext.jsx'
import { OrgProvider } from '../context/OrgContext.jsx'

// Racine des pages qui ont besoin de la session (connexion, inscription, /app/*).
// Chargée à la demande : la page d'accueil n'embarque pas le client Supabase.
// Les notifications (ToastProvider) sont montées par AuthLayout et AppLayout.
export default function RacineSession() {
  return (
    <AuthProvider>
      <OrgProvider>
        <Outlet />
      </OrgProvider>
    </AuthProvider>
  )
}
