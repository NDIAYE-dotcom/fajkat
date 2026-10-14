// Accès à Supabase Auth : inscription, connexion, mot de passe, déconnexion.
// Les pages n'appellent jamais Supabase directement : elles passent par ce fichier.

import { MESSAGE_INDISPONIBLE, traduireErreur } from './erreursAuth.js'
import { supabase } from './supabase.js'

// Connexion par code SMS : prête, mais fermée tant que le fournisseur SMS n'est pas
// configuré dans Supabase (VITE_AUTH_SMS=true pour l'ouvrir).
export const CONNEXION_SMS_ACTIVE = import.meta.env.VITE_AUTH_SMS === 'true'

function client() {
  if (!supabase) throw new Error(MESSAGE_INDISPONIBLE)
  return supabase
}

// Page d'arrivée des liens envoyés par e-mail. Les modèles d'e-mail s'en servent via
// {{ .RedirectTo }} : le lien ramène sur le site d'où vient la demande (local ou en ligne).
// Doit figurer dans Auth → URL Configuration → Redirect URLs.
// type=recovery : distingue le mot de passe oublié d'une confirmation d'inscription
// quand le lien par défaut de Supabase ne revient qu'avec ?code=….
function urlConfirmation(type) {
  const base = `${window.location.origin}/auth/confirmer`
  return type ? `${base}?type=${type}` : base
}

// Types de liens acceptés par /auth/confirmer.
export const TYPES_LIEN_EMAIL = ['email', 'signup', 'recovery']

async function executer(promesse, repli) {
  let resultat
  try {
    resultat = await promesse
  } catch (erreur) {
    throw traduireErreur(erreur, repli)
  }
  if (resultat.error) throw traduireErreur(resultat.error, repli)
  return resultat.data
}

// structure : { name, type, country_code, region, health_district, commune }.
// Elle est gardée dans les métadonnées du compte et créée à la première connexion
// (finalize_pending_organization), même si l'e-mail est confirmé sur un autre appareil.
// Renvoie { confirmationRequise } : true si l'e-mail doit être confirmé avant de se connecter.
export async function inscrire({ nomComplet, telephone, email, motDePasse, structure }) {
  const data = await executer(
    client().auth.signUp({
      email,
      password: motDePasse,
      options: {
        emailRedirectTo: urlConfirmation(),
        data: { full_name: nomComplet, phone: telephone, pending_organization: structure },
      },
    }),
    'L’inscription n’a pas abouti. Réessayez dans un instant.',
  )
  // Adresse déjà inscrite : Supabase renvoie un compte sans identité (pour ne pas révéler
  // l'existence du compte à un inconnu). On le dit clairement à la personne.
  if (data.user && data.user.identities?.length === 0) {
    throw traduireErreur({ code: 'user_already_exists' })
  }
  return { confirmationRequise: !data.session }
}

export function renvoyerConfirmation(email) {
  return executer(
    client().auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: urlConfirmation() },
    }),
    'L’e-mail n’a pas pu être renvoyé. Réessayez dans un instant.',
  )
}

// Lien reçu par e-mail : ouvre la session (confirmation d'inscription ou mot de passe oublié).
export function verifierLienEmail(tokenHash, type) {
  return executer(
    client().auth.verifyOtp({ token_hash: tokenHash, type }),
    'Ce lien n’a pas pu être vérifié. Réessayez.',
  )
}

// Lien par défaut de Supabase (?code=…). Le flux PKCE exige le navigateur qui a fait
// la demande : ouvert sur un autre appareil, l'échange échoue (l'adresse, elle, est
// tout de même confirmée).
export function echangerCode(code) {
  return executer(
    client().auth.exchangeCodeForSession(code),
    'Ce lien n’a pas pu être vérifié. Réessayez.',
  )
}

export function connecter(email, motDePasse) {
  return executer(
    client().auth.signInWithPassword({ email, password: motDePasse }),
    'La connexion n’a pas abouti. Réessayez dans un instant.',
  )
}

// Téléphone au format E.164. shouldCreateUser: false : le SMS ne sert qu'à se connecter
// à un compte existant ; l'inscription passe par l'e-mail.
export function envoyerCodeSms(telephone) {
  return executer(
    client().auth.signInWithOtp({ phone: telephone, options: { shouldCreateUser: false } }),
    'Le code n’a pas pu être envoyé. Réessayez dans un instant.',
  )
}

export function verifierCodeSms(telephone, code) {
  return executer(
    client().auth.verifyOtp({ phone: telephone, token: code, type: 'sms' }),
    'Le code n’a pas pu être vérifié. Réessayez.',
  )
}

export function demanderReinitialisation(email) {
  return executer(
    client().auth.resetPasswordForEmail(email, { redirectTo: urlConfirmation('recovery') }),
    'L’e-mail n’a pas pu être envoyé. Réessayez dans un instant.',
  )
}

export function changerMotDePasse(motDePasse) {
  return executer(
    client().auth.updateUser({ password: motDePasse }),
    'Le mot de passe n’a pas pu être changé. Réessayez.',
  )
}

// Relit la session après une modification des métadonnées côté serveur.
export function rafraichirSession() {
  return executer(client().auth.refreshSession(), 'Session non rafraîchie.')
}

// Session enregistrée par Supabase dans le navigateur (clé « sb-<projet>-auth-token »).
function effacerSessionLocale() {
  try {
    Object.keys(localStorage)
      .filter((cle) => cle.startsWith('sb-') && cle.includes('-auth-token'))
      .forEach((cle) => localStorage.removeItem(cle))
  } catch {
    // Stockage indisponible : aucune session n'a pu y être gardée.
  }
}

// Déconnexion de cet appareil seulement (un téléphone peut être partagé par l'équipe).
// Renvoie true si la session a été fermée normalement. Hors ligne, Supabase garde la
// session : on l'efface nous-mêmes et on renvoie false (la page doit alors être rechargée).
export async function deconnecter() {
  if (!supabase) return true
  try {
    const { error } = await supabase.auth.signOut({ scope: 'local' })
    if (!error) return true
  } catch {
    // Réseau coupé : traité ci-dessous.
  }
  effacerSessionLocale()
  return false
}

// Abonnement aux changements de session. Renvoie la fonction de désabonnement.
export function ecouterSession(rappel) {
  if (!supabase) {
    rappel('INITIAL_SESSION', null)
    return () => {}
  }
  const { data } = supabase.auth.onAuthStateChange(rappel)
  return () => data.subscription.unsubscribe()
}
