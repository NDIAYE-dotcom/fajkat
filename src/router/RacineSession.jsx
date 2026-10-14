import { Outlet } from 'react-router-dom'
import ToastProvider from '../components/ui/Toast/ToastProvider.jsx'
import { AuthProvider } from '../context/AuthContext.jsx'
import { OrgProvider } from '../context/OrgContext.jsx'

// Racine des pages qui ont besoin de la session (connexion, inscription, /app/*).
// Chargée à la demande : la page d'accueil n'embarque pas le client Supabase.
export default function RacineSession() {
  return (
    <AuthProvider>
      <OrgProvider>
        <ToastProvider>
          <Outlet />
        </ToastProvider>
      </OrgProvider>
    </AuthProvider>
  )
}
