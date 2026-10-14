import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import AuthPage from '../../../components/layout/AuthPage/AuthPage.jsx'
import EcranAttente from '../../../components/layout/EcranAttente/EcranAttente.jsx'
import Button from '../../../components/ui/Button/Button.jsx'
import Message from '../../../components/ui/Message/Message.jsx'
import { useAuth } from '../../../hooks/useAuth.js'
import { useOrganization } from '../../../hooks/useOrganization.js'
import { ouvrirSessionDepuisLien, verifierLienEmail } from '../../../lib/auth.js'
import { formatDate } from '../../../lib/format.js'
import { getOffre } from '../../../lib/offres.js'
import { cles, lireInvitationPublique } from '../../../modules/personnel/api.js'
import { libelleRole } from '../../../modules/personnel/utils.js'
import CreerCompte from './CreerCompte/CreerCompte.jsx'
import RejoindreConnecte from './RejoindreConnecte/RejoindreConnecte.jsx'
import './Invitation.css'

const MOTIF_JETON = /^[0-9a-f]{64}$/

const REFUS = {
  unknown: {
    titre: 'Lien non valable',
    texte:
      'Ce lien d’invitation n’est pas reconnu. Vérifiez qu’il a été copié en entier, ou demandez un nouveau lien au responsable de la structure.',
  },
  revoked: {
    titre: 'Invitation annulée',
    texte:
      'Le responsable de la structure a annulé cette invitation. Demandez-lui un nouveau lien si besoin.',
  },
  used: {
    titre: 'Lien déjà utilisé',
    texte: 'Ce lien a déjà servi à rejoindre la structure. Si c’est vous, connectez-vous.',
  },
  expired: {
    titre: 'Lien expiré',
    texte:
      'Un lien d’invitation est valable 7 jours. Demandez un nouveau lien au responsable de la structure.',
  },
  unavailable: {
    titre: 'Structure indisponible',
    texte: 'Cette structure n’est pas accessible pour le moment. Prévenez son responsable.',
  },
  full: {
    titre: 'Plus de place disponible',
    texte:
      'La structure a atteint le nombre maximal d’utilisateurs de son offre. Prévenez son responsable.',
  },
}

// Lien reçu par e-mail : Supabase revient sur cette page avec la session dans l'ancre
// (#access_token=…) ou, avec les modèles Fajkat, ?token_hash=…&type=invite|magiclink.
function lireLienEmail() {
  const ancre = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const requete = new URLSearchParams(window.location.search)
  return {
    accessToken: ancre.get('access_token'),
    refreshToken: ancre.get('refresh_token'),
    tokenHash: requete.get('token_hash'),
    type: requete.get('type'),
    erreur: ancre.get('error_code') ?? requete.get('error_code'),
  }
}

// /invitation/:jeton : créer son compte (ou se connecter), puis rejoindre la structure
// avec le rôle prévu. Tout est revérifié côté serveur.
export default function Invitation() {
  const { jeton } = useParams()
  const navigate = useNavigate()
  const { session, initialise } = useAuth()
  const { structureCreee } = useOrganization()
  const [lienEmail] = useState(lireLienEmail)
  const [arrivee, setArrivee] = useState(null)
  const [echecApresConnexion, setEchecApresConnexion] = useState(null)
  // Connexion lancée depuis cette page : on garde le formulaire à l'écran jusqu'au bout.
  const [connexionEnCours, setConnexionEnCours] = useState(false)
  const jetonValide = MOTIF_JETON.test(jeton ?? '')

  const aOuvrir = Boolean(
    !lienEmail.erreur && ((lienEmail.accessToken && lienEmail.refreshToken) || lienEmail.tokenHash),
  )
  const ouverture = useQuery({
    queryKey: ['lien-invitation', lienEmail.accessToken ?? lienEmail.tokenHash],
    queryFn: async () => {
      const resultat = lienEmail.tokenHash
        ? await verifierLienEmail(lienEmail.tokenHash, lienEmail.type ?? 'invite')
        : await ouvrirSessionDepuisLien(lienEmail.accessToken, lienEmail.refreshToken)
      // Les jetons de session ne restent pas dans l'adresse (historique, capture d'écran).
      window.history.replaceState(null, '', window.location.pathname)
      return resultat
    },
    enabled: aOuvrir,
    retry: false,
    staleTime: Infinity,
    gcTime: Infinity,
  })

  const invitation = useQuery({
    queryKey: cles.invitationPublique(jeton),
    queryFn: () => lireInvitationPublique(jeton),
    enabled: jetonValide && !arrivee,
    retry: 1,
  })

  useEffect(() => {
    document.title = 'Invitation — Fajkat'
  }, [])

  // Structure rejointe : elle devient la structure active, puis l'application s'ouvre.
  useEffect(() => {
    if (!arrivee) return
    let actif = true
    structureCreee(arrivee)
      .catch(() => {})
      .finally(() => actif && navigate('/app', { replace: true }))
    return () => {
      actif = false
    }
  }, [arrivee, structureCreee, navigate])

  if (arrivee) return <EcranAttente integre libelle="Ouverture de votre structure…" />
  if (!initialise || (aOuvrir && ouverture.isPending) || (jetonValide && invitation.isPending)) {
    return <EcranAttente integre libelle="Vérification de l’invitation…" />
  }
  if (invitation.isError) {
    return (
      <EcranAttente
        integre
        libelle="L’invitation n’a pas pu être lue"
        erreur={invitation.error.message}
      >
        <Button onClick={() => invitation.refetch()}>Réessayer</Button>
      </EcranAttente>
    )
  }

  const donnees = jetonValide ? invitation.data : { status: 'unknown' }
  if (donnees.status !== 'valid') {
    const refus = REFUS[donnees.status] ?? REFUS.unknown
    return (
      <AuthPage titre={refus.titre}>
        <Message ton="info">
          <p>{refus.texte}</p>
        </Message>
        <div className="invitation__actions">
          {session ? (
            <Button to="/app">Ouvrir Fajkat</Button>
          ) : (
            <Button to="/connexion">Se connecter</Button>
          )}
        </div>
      </AuthPage>
    )
  }

  const offre = getOffre(donnees.org_type)
  return (
    <AuthPage
      titre={`Rejoindre ${donnees.org_name}`}
      intro={`${offre ? `${offre.nom} · ` : ''}rôle prévu : ${libelleRole(donnees.role)}.`}
    >
      <p className="invitation__validite">
        Lien personnel, valable jusqu’au{' '}
        <span className="invitation__date">{formatDate(donnees.expires_at)}</span>.
      </p>

      {(lienEmail.erreur || ouverture.isError) && (
        <Message ton="info" titre="Lien de l’e-mail expiré">
          <p>
            Le lien de l’e-mail a expiré ou a déjà servi. Vous pouvez tout de même rejoindre la
            structure ci-dessous.
          </p>
        </Message>
      )}

      {session && !connexionEnCours ? (
        <RejoindreConnecte
          jeton={jeton}
          structure={donnees.org_name}
          erreurInitiale={echecApresConnexion}
          onRejoint={setArrivee}
        />
      ) : (
        <CreerCompte
          jeton={jeton}
          invitation={donnees}
          onConnexion={setConnexionEnCours}
          onRejoint={setArrivee}
          onEchecApresConnexion={setEchecApresConnexion}
        />
      )}
    </AuthPage>
  )
}
