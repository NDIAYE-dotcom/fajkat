import { useQuery } from '@tanstack/react-query'
import { Navigate, useSearchParams } from 'react-router-dom'
import AuthPage from '../../../components/layout/AuthPage/AuthPage.jsx'
import EcranAttente from '../../../components/layout/EcranAttente/EcranAttente.jsx'
import Button from '../../../components/ui/Button/Button.jsx'
import Message from '../../../components/ui/Message/Message.jsx'
import { useAuth } from '../../../hooks/useAuth.js'
import { echangerCode, TYPES_LIEN_EMAIL, verifierLienEmail } from '../../../lib/auth.js'
import './ConfirmerLien.css'

// Lien ouvert dans un autre navigateur que celui de la demande : le flux PKCE ne peut pas
// ouvrir la session (le secret de la demande est resté sur l'autre appareil).
function autreAppareil(erreur) {
  return (
    erreur?.code === 'pkce_code_verifier_not_found' ||
    erreur?.cause?.name === 'AuthPKCECodeVerifierMissingError'
  )
}

// Arrivée d'un lien reçu par e-mail, sous deux formes :
// - lien par défaut de Supabase : /auth/confirmer?code=… (avec ?type=recovery pour le mot
//   de passe, ajouté par redirectTo) -> exchangeCodeForSession ;
// - modèles Fajkat (SMTP personnalisé) : ?token_hash=…&type=email|recovery -> verifyOtp.
// Lien expiré ou déjà utilisé : Supabase revient avec ?error_code=otp_expired.
export default function ConfirmerLien() {
  const [parametres] = useSearchParams()
  const code = parametres.get('code')
  const tokenHash = parametres.get('token_hash')
  const type = parametres.get('type') ?? 'email'
  const erreurLien = parametres.get('error_code') ?? parametres.get('error')
  const recuperation = type === 'recovery'
  const aVerifier =
    !erreurLien && (Boolean(code) || (Boolean(tokenHash) && TYPES_LIEN_EMAIL.includes(type)))
  const { debutRecuperation } = useAuth()

  // React Query : une seule vérification, même si la page est rendue deux fois
  // (un code ou un jeton ne sert qu'une fois).
  const verification = useQuery({
    queryKey: ['lien-email', code ?? tokenHash],
    queryFn: async () => {
      const session = code ? await echangerCode(code) : await verifierLienEmail(tokenHash, type)
      // Avant la redirection : /reinitialiser doit trouver la récupération déjà ouverte.
      if (recuperation) debutRecuperation()
      return session
    },
    enabled: aVerifier,
    retry: false,
    staleTime: Infinity,
    gcTime: Infinity,
  })

  if (aVerifier && verification.isPending) {
    return <EcranAttente integre libelle="Vérification du lien…" />
  }

  if (verification.isSuccess) {
    // Inscription confirmée : /app crée la structure gardée avec le compte.
    return <Navigate to={recuperation ? '/reinitialiser' : '/app'} replace />
  }

  // Inscription confirmée depuis un autre appareil : l'adresse est bien confirmée par
  // Supabase avant le retour sur le site, il suffit de se connecter.
  if (!recuperation && autreAppareil(verification.error)) {
    return (
      <AuthPage titre="Adresse e-mail confirmée">
        <div className="confirmer-lien">
          <Message ton="succes">
            <p>
              Votre adresse est confirmée. Connectez-vous : votre structure sera créée à la première
              connexion.
            </p>
          </Message>
          <div className="confirmer-lien__actions">
            <Button to="/connexion">Se connecter</Button>
          </div>
        </div>
      </AuthPage>
    )
  }

  let explication = 'Un lien ne sert qu’une fois et expire au bout d’une heure.'
  if (recuperation && autreAppareil(verification.error)) {
    explication =
      'Ouvrez le lien sur l’appareil où vous avez demandé le nouveau mot de passe, ou faites une nouvelle demande ici.'
  } else if (verification.error && verification.error.code !== 'otp_expired') {
    explication = verification.error.message
  }

  return (
    <AuthPage titre="Ce lien n’est plus valable">
      <div className="confirmer-lien">
        <Message ton="erreur" titre="Lien expiré, déjà utilisé ou incomplet">
          <p>{explication}</p>
          <p>
            {recuperation
              ? 'Demandez un nouveau lien pour changer votre mot de passe.'
              : 'Si votre adresse est déjà confirmée, connectez-vous. Sinon, la page de connexion vous proposera de recevoir un nouvel e-mail.'}
          </p>
        </Message>
        <div className="confirmer-lien__actions">
          {recuperation ? (
            <Button to="/mot-de-passe-oublie">Recevoir un nouveau lien</Button>
          ) : (
            <Button to="/connexion">Se connecter</Button>
          )}
        </div>
      </div>
    </AuthPage>
  )
}
