import { Link, Outlet } from 'react-router-dom'
import ToastProvider from '../../ui/Toast/ToastProvider.jsx'
import './AuthLayout.css'

// Situations réelles rappelées à côté du formulaire (grand écran seulement).
const LIGNES_REGISTRE = [
  'La file d’attente du matin, tenue par l’accueil.',
  'Le rappel du vaccin de 10 semaines, envoyé la veille sur WhatsApp.',
  'La caisse du soir, juste au franc près.',
]

// Cadre des pages de connexion et d'inscription : sobre, comme l'application.
// Sur grand écran, une page de registre à gauche ; sur téléphone, le formulaire seul.
export default function AuthLayout() {
  return (
    <ToastProvider>
      <div className="auth-layout">
        <header className="auth-layout__entete">
          <Link to="/" className="auth-layout__marque">
            Fajkat
          </Link>
          <Link to="/" className="auth-layout__retour">
            Retour au site
          </Link>
        </header>

        <div className="auth-layout__corps">
          <aside className="auth-layout__registre" aria-hidden="true">
            <p className="auth-layout__registre-titre">Le registre de votre structure</p>
            <ol className="auth-layout__lignes">
              {LIGNES_REGISTRE.map((ligne) => (
                <li key={ligne} className="auth-layout__ligne">
                  {ligne}
                </li>
              ))}
            </ol>
          </aside>

          <main className="auth-layout__contenu" id="contenu">
            <Outlet />
          </main>
        </div>
      </div>
    </ToastProvider>
  )
}
