// Traduction des erreurs de Supabase (Auth et RPC) en messages français clairs :
// ce qui s'est passé, et ce que la personne peut faire. Jamais de jargon technique.

export const MESSAGE_INDISPONIBLE =
  'Le service est momentanément indisponible. Réessayez dans un instant.'

const MESSAGE_RESEAU =
  'Connexion impossible. Vérifiez votre accès à Internet, puis réessayez. Votre saisie est conservée.'

// Codes d'erreur de Supabase Auth (error.code).
const MESSAGES_AUTH = {
  invalid_credentials: 'E-mail ou mot de passe incorrect. Vérifiez votre saisie, puis réessayez.',
  email_not_confirmed:
    'Votre adresse e-mail n’est pas encore confirmée. Ouvrez le lien reçu par e-mail.',
  user_already_exists: 'Un compte existe déjà avec cette adresse e-mail. Connectez-vous.',
  email_exists: 'Un compte existe déjà avec cette adresse e-mail. Connectez-vous.',
  phone_exists: 'Ce numéro est déjà utilisé par un autre compte.',
  weak_password:
    'Mot de passe trop simple : au moins 8 caractères, avec au moins une lettre et un chiffre.',
  same_password: 'Le nouveau mot de passe doit être différent de l’ancien.',
  email_address_invalid: 'Cette adresse e-mail n’est pas valide. Vérifiez l’orthographe.',
  validation_failed: 'Certaines informations ne sont pas valides. Vérifiez votre saisie.',
  over_email_send_rate_limit:
    'Trop d’e-mails envoyés en peu de temps. Patientez quelques minutes avant de réessayer.',
  over_sms_send_rate_limit:
    'Trop de codes envoyés en peu de temps. Patientez quelques minutes avant de réessayer.',
  over_request_rate_limit: 'Trop de tentatives. Patientez quelques minutes avant de réessayer.',
  otp_expired: 'Ce code ou ce lien a expiré ou a déjà servi. Demandez-en un nouveau.',
  otp_disabled: 'La connexion par code SMS n’est pas encore ouverte.',
  phone_provider_disabled: 'La connexion par code SMS n’est pas encore ouverte.',
  sms_send_failed: 'Le SMS n’a pas pu être envoyé. Vérifiez le numéro, puis réessayez.',
  user_not_found: 'Aucun compte ne correspond à ces informations.',
  user_banned: 'Ce compte est suspendu. Contactez l’équipe Fajkat.',
  signup_disabled: 'Les inscriptions sont momentanément fermées.',
  session_not_found: 'Votre session a expiré. Reconnectez-vous.',
  session_expired: 'Votre session a expiré. Reconnectez-vous.',
  refresh_token_not_found: 'Votre session a expiré. Reconnectez-vous.',
  reauthentication_needed: 'Par sécurité, reconnectez-vous avant de changer de mot de passe.',
}

// Codes Postgres renvoyés par les fonctions SQL (create_organization…).
// 22023 : message déjà rédigé en français dans la fonction, affiché tel quel.
const MESSAGES_SQL = {
  28000: 'Votre session a expiré. Reconnectez-vous.',
  23514: 'Certaines informations de la structure ne sont pas valides (nom de 2 à 200 caractères).',
  42501: 'Vous n’avez pas les droits nécessaires pour cette action.',
}

export function estErreurReseau(erreur) {
  return (
    erreur?.name === 'AuthRetryableFetchError' ||
    erreur?.status === 0 ||
    /failed to fetch|networkerror|load failed|network request failed/i.test(erreur?.message ?? '')
  )
}

// Renvoie une Error dont le message est prêt à afficher ; l'erreur d'origine est dans cause,
// son code dans « code » (pour adapter l'écran : renvoi de l'e-mail de confirmation…).
export function traduireErreur(erreur, repli = 'Une erreur est survenue. Réessayez.') {
  if (!erreur) return new Error(repli)
  // Anciennes versions de l'API : pas de code, seulement un message en anglais.
  let code = erreur.code ?? null
  if (!code && /invalid login credentials/i.test(erreur.message ?? '')) code = 'invalid_credentials'
  if (!code && /email not confirmed/i.test(erreur.message ?? '')) code = 'email_not_confirmed'

  let message
  if (estErreurReseau(erreur)) message = MESSAGE_RESEAU
  else if (code && MESSAGES_AUTH[code]) message = MESSAGES_AUTH[code]
  else if (code === '22023' && erreur.message) message = erreur.message
  else if (code && MESSAGES_SQL[code]) message = MESSAGES_SQL[code]
  else if (erreur.status === 429) message = MESSAGES_AUTH.over_request_rate_limit
  else message = repli

  const traduite = new Error(message, { cause: erreur })
  traduite.code = code
  return traduite
}
