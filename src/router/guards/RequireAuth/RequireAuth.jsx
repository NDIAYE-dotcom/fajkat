import { Navigate, Outlet, useLocation } from 'react-router-dom'
import EcranAttente from '../../../components/layout/EcranAttente/EcranAttente.jsx'
import Button from '../../../components/ui/Button/Button.jsx'
import { useAuth } from '../../../hooks/useAuth.js'
import { useOrganization } from '../../../hooks/useOrganization.js'

// Garde de /app/* : une session ET une structure active.
// Sans session -> /connexion (avec retour vers la page demandée) ;
// sans structure -> /inscription, à l'étape « Structure » (le compte existe déjà).
export default function RequireAuth() {
  const { session, initialise } = useAuth()
  const { structure, chargement, erreur, erreurFinalisation, recharger } = useOrganization()
  const { pathname, search } = useLocation()

  if (!initialise) return <EcranAttente libelle="Ouverture de votre session…" />

  if (!session) {
    const retour = encodeURIComponent(pathname + search)
    return <Navigate to={`/connexion?retour=${retour}`} replace />
  }

  if (chargement) return <EcranAttente libelle="Chargement de votre structure…" />

  if (erreur) {
    return (
      <EcranAttente libelle="Votre structure n’a pas pu être chargée" erreur={erreur.message}>
        <Button onClick={recharger}>Réessayer</Button>
      </EcranAttente>
    )
  }

  if (!structure) {
    // La création automatique a échoué : on le dit avant de proposer de corriger.
    if (erreurFinalisation) {
      return (
        <EcranAttente
          libelle="Votre structure n’a pas encore été créée"
          erreur={erreurFinalisation.message}
        >
          <Button onClick={recharger}>Réessayer</Button>
          <Button to="/inscription" variante="secondaire">
            Vérifier les informations
          </Button>
        </EcranAttente>
      )
    }
    return <Navigate to="/inscription" replace />
  }

  return <Outlet />
}
