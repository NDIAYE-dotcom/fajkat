import { Link, Navigate } from 'react-router-dom'
import AuthPage from '../../../components/layout/AuthPage/AuthPage.jsx'
import EcranAttente from '../../../components/layout/EcranAttente/EcranAttente.jsx'
import Tabs from '../../../components/ui/Tabs/Tabs.jsx'
import { useAuth } from '../../../hooks/useAuth.js'
import { useRetourApresConnexion } from '../../../hooks/useRetourApresConnexion.js'
import { CONNEXION_SMS_ACTIVE } from '../../../lib/auth.js'
import FormulaireEmail from './FormulaireEmail/FormulaireEmail.jsx'
import FormulaireSms from './FormulaireSms/FormulaireSms.jsx'

export default function Connexion() {
  const { session, initialise, recuperation } = useAuth()
  const retour = useRetourApresConnexion()

  if (!initialise) return <EcranAttente integre libelle="Ouverture de votre session…" />
  // Déjà connecté (ou connexion réussie) : on va directement à l'application.
  if (session && recuperation) return <Navigate to="/reinitialiser" replace />
  if (session) return <Navigate to={retour} replace />

  return (
    <AuthPage
      titre="Connexion"
      intro="Ouvrez le registre de votre structure."
      pied={
        <>
          <p>
            Pas encore de compte ? <Link to="/inscription">Inscrire ma structure</Link>
          </p>
          <p>
            <Link to="/mot-de-passe-oublie">Mot de passe oublié ?</Link>
          </p>
        </>
      }
    >
      {CONNEXION_SMS_ACTIVE ? (
        <Tabs
          libelle="Mode de connexion"
          onglets={[
            { id: 'email', libelle: 'Par e-mail', contenu: <FormulaireEmail /> },
            { id: 'sms', libelle: 'Par SMS', contenu: <FormulaireSms /> },
          ]}
        />
      ) : (
        <FormulaireEmail />
      )}
    </AuthPage>
  )
}
