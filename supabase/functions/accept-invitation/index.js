// Edge Function accept-invitation : création d'un compte depuis un lien d'invitation.
//
// Corps : { jeton, nom_complet, telephone, email, mot_de_passe }
// Réponse : { org_id } ; en cas de refus : { code, message } (message en français).
//
// Le lien à usage unique, reçu sur WhatsApp, sert de preuve : le compte est créé déjà
// confirmé (pas d'e-mail de confirmation, indisponible sans SMTP).
// Garde-fous :
//   - le jeton est vérifié AVANT toute autre chose : sans lien valable, rien n'indique
//     si une adresse a un compte ;
//   - le compte est créé avec le jeton dans ses métadonnées ; le trigger handle_new_user
//     accepte l'invitation dans la même transaction (jeton, expiration, usage unique,
//     max_users revérifiés) et efface le jeton. Un refus annule la création du compte ;
//   - adresse déjà inscrite : rien n'est créé ni modifié ; la personne se connecte, puis
//     rejoint la structure depuis la même page (RPC accept_invitation).

import {
  clientAppelant,
  clientServeur,
  CORS,
  lireCorps,
  MESSAGE_GENERIQUE,
  refuser,
  repondre,
} from '../_shared/http.js'

const MOTIF_JETON = /^[0-9a-f]{64}$/
const MOTIF_EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const MOTIF_TELEPHONE = /^\+[0-9]{8,15}$/

// Mêmes règles que l'inscription (src/lib/motDePasse.js).
function motDePasseValide(m) {
  return typeof m === 'string' && m.length >= 8 && /[a-z]/i.test(m) && /\d/.test(m)
}

const MESSAGES_STATUT = {
  unknown:
    'Ce lien d’invitation n’est pas valable. Demandez un nouveau lien au responsable de la structure.',
  revoked:
    'Cette invitation a été annulée. Demandez un nouveau lien au responsable de la structure.',
  used: 'Ce lien d’invitation a déjà servi. Si c’est vous, connectez-vous.',
  expired:
    'Ce lien d’invitation a expiré. Demandez un nouveau lien au responsable de la structure.',
  unavailable: 'Cette structure n’est pas accessible pour le moment.',
  full: 'La structure a atteint le nombre maximal d’utilisateurs de son offre. Prévenez son responsable.',
}

const MESSAGE_COMPTE_EXISTANT =
  'Cette adresse a déjà un compte : connectez-vous pour rejoindre la structure.'

async function statutInvitation(jeton) {
  const { data, error } = await clientAppelant(null).rpc('get_invitation_public', {
    p_token: jeton,
  })
  if (error) throw error
  return (Array.isArray(data) ? data[0] : data)?.status ?? 'unknown'
}

Deno.serve(async (requete) => {
  if (requete.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (requete.method !== 'POST') return refuser(405, 'methode', 'Méthode non autorisée.')
  try {
    return await accepter(requete)
  } catch {
    return refuser(500, 'interne', MESSAGE_GENERIQUE)
  }
})

async function accepter(requete) {
  const corps = await lireCorps(requete)
  const jeton = String(corps.jeton ?? '')

  // 1. Le lien d'abord.
  if (!MOTIF_JETON.test(jeton)) return refuser(400, 'unknown', MESSAGES_STATUT.unknown)
  const statut = await statutInvitation(jeton)
  if (statut !== 'valid')
    return refuser(400, statut, MESSAGES_STATUT[statut] ?? MESSAGES_STATUT.unknown)

  // 2. La saisie.
  const nomComplet = String(corps.nom_complet ?? '').trim()
  const email = String(corps.email ?? '')
    .trim()
    .toLowerCase()
  const telephone = String(corps.telephone ?? '').trim()
  const motDePasse = corps.mot_de_passe
  if (nomComplet.length < 2 || nomComplet.length > 160) {
    return refuser(400, 'donnees', 'Indiquez votre prénom et votre nom.')
  }
  if (!MOTIF_EMAIL.test(email)) {
    return refuser(400, 'donnees', 'Cette adresse e-mail n’est pas valide. Vérifiez l’orthographe.')
  }
  if (telephone && !MOTIF_TELEPHONE.test(telephone)) {
    return refuser(400, 'donnees', 'Ce numéro de téléphone n’est pas valide.')
  }
  if (!motDePasseValide(motDePasse)) {
    return refuser(
      400,
      'weak_password',
      'Choisissez un mot de passe d’au moins 8 caractères, avec au moins une lettre et un chiffre.',
    )
  }

  // 3. Compte + invitation, en une seule transaction côté base.
  const serveur = clientServeur()
  const { data, error } = await serveur.auth.admin.createUser({
    email,
    password: motDePasse,
    email_confirm: true,
    user_metadata: {
      full_name: nomComplet,
      phone: telephone || null,
      invitation_token: jeton,
    },
  })

  if (error) {
    if (error.code === 'email_exists' || /already been registered/i.test(error.message ?? '')) {
      return refuser(409, 'compte_existant', MESSAGE_COMPTE_EXISTANT)
    }
    if (error.code === 'weak_password') {
      return refuser(
        400,
        'weak_password',
        'Mot de passe trop simple : au moins 8 caractères, avec au moins une lettre et un chiffre.',
      )
    }
    // Refus de la base (lien utilisé entre-temps, offre complète…) : on relit l'état.
    const apres = await statutInvitation(jeton).catch(() => 'valid')
    if (apres !== 'valid')
      return refuser(400, apres, MESSAGES_STATUT[apres] ?? MESSAGES_STATUT.unknown)
    return refuser(500, 'interne', 'Votre compte n’a pas pu être créé. Réessayez dans un instant.')
  }

  const { data: membre } = await serveur
    .from('memberships')
    .select('org_id')
    .eq('user_id', data.user.id)
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle()

  return repondre(200, { org_id: membre?.org_id ?? null })
}
