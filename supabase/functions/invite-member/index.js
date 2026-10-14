// Edge Function invite-member : envoi d'une invitation par e-mail (option secondaire,
// le lien WhatsApp reste l'envoi principal).
//
// Corps : { org_id, origine, invitation_id }               -> nouveau lien pour une invitation
//         { org_id, origine, pending_id }                  -> invitation notée dans l'assistant
//         { org_id, origine, role, full_name, email, phone } -> nouvelle invitation
// Réponse : { envoye, lien, invitation_id, expires_at, message }
//
// L'invitation est créée avec les droits de l'appelant (create_invitation vérifie owner /
// admin, max_users, statut de la structure). Puis Supabase Auth envoie l'e-mail :
//   - adresse inconnue : invitation Supabase (le compte est créé à l'ouverture du lien,
//     la personne choisit ensuite son mot de passe sur /invitation/:jeton) ;
//   - adresse déjà inscrite : lien de connexion vers la même page.
// La réponse est la même dans les deux cas : on ne révèle pas si l'adresse a un compte.
// Tant que le SMTP n'est pas configuré, Supabase n'envoie qu'aux membres de l'équipe du
// projet : l'invitation reste créée et le lien est renvoyé pour WhatsApp ou copie.

import {
  clientAppelant,
  clientServeur,
  CORS,
  lireCorps,
  MESSAGE_GENERIQUE,
  origineSure,
  refuser,
  repondre,
} from '../_shared/http.js'

const MOTIF_EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

const MESSAGE_SMTP =
  'L’e-mail n’a pas pu partir : l’envoi par e-mail fonctionnera quand le SMTP sera configuré. ' +
  'L’invitation est prête : envoyez le lien par WhatsApp ou copiez-le.'

Deno.serve(async (requete) => {
  if (requete.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (requete.method !== 'POST') return refuser(405, 'methode', 'Méthode non autorisée.')
  try {
    return await inviter(requete)
  } catch {
    return refuser(500, 'interne', MESSAGE_GENERIQUE)
  }
})

async function inviter(requete) {
  const autorisation = requete.headers.get('Authorization')
  const appelant = clientAppelant(autorisation)
  const { data: session, error: erreurSession } = await appelant.auth.getUser()
  if (erreurSession || !session?.user) {
    return refuser(401, 'session', 'Votre session a expiré. Reconnectez-vous.')
  }

  const corps = await lireCorps(requete)
  const orgId = corps.org_id
  if (!orgId) return refuser(400, 'donnees', 'Structure non précisée.')

  // 1. Invitation : nouveau lien, reprise de l'assistant, ou nouvelle invitation.
  let rpc
  if (corps.invitation_id) {
    rpc = await appelant.rpc('renew_invitation', {
      p_invitation_id: corps.invitation_id,
      p_channel: 'email',
    })
  } else {
    const email = String(corps.email ?? '')
      .trim()
      .toLowerCase()
    if (!corps.pending_id && !MOTIF_EMAIL.test(email)) {
      return refuser(400, 'donnees', 'Indiquez une adresse e-mail valide.')
    }
    rpc = await appelant.rpc('create_invitation', {
      p_org_id: orgId,
      p_role: corps.role ?? null,
      p_full_name: corps.full_name ?? null,
      p_phone: corps.phone || null,
      p_email: email || null,
      p_channel: 'email',
      p_pending_id: corps.pending_id ?? null,
    })
  }
  if (rpc.error) {
    // 22023 / 42501 : refus rédigé en français dans la fonction SQL.
    const lisible = ['22023', '42501', '28000'].includes(rpc.error.code)
    return refuser(
      lisible ? 400 : 500,
      rpc.error.code ?? 'rpc',
      lisible ? rpc.error.message : 'L’invitation n’a pas pu être créée. Réessayez.',
    )
  }
  const invitation = Array.isArray(rpc.data) ? rpc.data[0] : rpc.data
  const lien = `${origineSure(corps.origine)}/invitation/${invitation.token}`

  // 2. Adresse de l'invitation (lue avec les droits de l'appelant).
  const { data: ligne } = await appelant
    .from('invitations')
    .select('email, full_name, phone')
    .eq('id', invitation.invitation_id)
    .single()
  const email = ligne?.email
  const base = {
    lien,
    invitation_id: invitation.invitation_id,
    expires_at: invitation.expires_at,
  }
  if (!email) {
    return repondre(200, {
      ...base,
      envoye: false,
      message: 'Cette invitation n’a pas d’adresse e-mail. Envoyez le lien par WhatsApp.',
    })
  }

  // 3. Envoi par Supabase Auth.
  try {
    const serveur = clientServeur()
    const { error } = await serveur.auth.admin.inviteUserByEmail(email, {
      redirectTo: lien,
      data: { full_name: ligne.full_name, phone: ligne.phone, invitation_sans_mot_de_passe: true },
    })
    if (error && (error.code === 'email_exists' || error.status === 422)) {
      // Compte existant : lien de connexion, sans création ni modification du compte.
      const { error: erreurLien } = await clientAppelant(null).auth.signInWithOtp({
        email,
        options: { shouldCreateUser: false, emailRedirectTo: lien },
      })
      if (erreurLien) return repondre(200, { ...base, envoye: false, message: MESSAGE_SMTP })
    } else if (error) {
      return repondre(200, { ...base, envoye: false, message: MESSAGE_SMTP })
    }
  } catch {
    return repondre(200, { ...base, envoye: false, message: MESSAGE_SMTP })
  }

  return repondre(200, {
    ...base,
    envoye: true,
    message: `Invitation envoyée à ${email}. Le lien est valable 7 jours.`,
  })
}
