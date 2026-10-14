// Accès aux données du module Personnel : membres, invitations, places de l'offre,
// fiches et pièces jointes (bucket privé « personnel », lues par URL signée).
// Les invitations passent par des fonctions SQL (jeton haché, max_users, droits) et
// par deux Edge Functions : invite-member (e-mail) et accept-invitation (compte créé
// depuis un lien). La RLS limite tout à la structure ; seuls owner et admin écrivent.

import { MESSAGE_INDISPONIBLE, traduireErreur } from '../../lib/erreursAuth.js'
import { supabase } from '../../lib/supabase.js'

function client() {
  if (!supabase) throw new Error(MESSAGE_INDISPONIBLE)
  return supabase
}

export const cles = {
  membres: (orgId) => ['personnel', 'membres', orgId],
  invitations: (orgId) => ['personnel', 'invitations', orgId],
  aEnvoyer: (orgId) => ['personnel', 'a-envoyer', orgId],
  places: (orgId) => ['personnel', 'places', orgId],
  fiche: (orgId, membreId) => ['personnel', 'fiche', orgId, membreId],
  maFiche: (orgId, userId) => ['personnel', 'ma-fiche', orgId, userId],
  pieces: (ficheId) => ['personnel', 'pieces', ficheId],
  invitationPublique: (jeton) => ['invitation', jeton],
}

// Réponse d'une Edge Function en erreur : { code, message } rédigé en français.
async function erreurFonction(error, repli) {
  try {
    const corps = await error.context?.json()
    if (corps?.message) {
      const traduite = new Error(corps.message, { cause: error })
      traduite.code = corps.code ?? null
      return traduite
    }
  } catch {
    // Corps illisible : message de repli.
  }
  return traduireErreur(error, repli)
}

// --- Membres -----------------------------------------------------------------

// [{ id, user_id, role, is_active, created_at, invited_by, profil, inviteur }]
export async function chargerMembres(orgId) {
  const { data, error } = await client()
    .from('memberships')
    .select(
      'id, user_id, role, is_active, created_at, invited_by, ' +
        'profil:profiles!memberships_user_id_fkey (full_name, phone, title), ' +
        'inviteur:profiles!memberships_invited_by_fkey (full_name), ' +
        'fiches:staff_files (job_title, phone, deleted_at)',
    )
    .eq('org_id', orgId)
    .is('deleted_at', null)
    .order('created_at')
  if (error) throw traduireErreur(error, 'Impossible de charger la liste du personnel.')
  // Fiche visible seulement par owner et admin (RLS) : sinon, fiche = null.
  return (data ?? []).map(({ fiches, ...membre }) => ({
    ...membre,
    fiche: fiches?.find((f) => !f.deleted_at) ?? null,
  }))
}

// champs : { role } ou { is_active }. Jamais de suppression.
export async function modifierMembre(membreId, champs) {
  const { data, error } = await client()
    .from('memberships')
    .update(champs)
    .eq('id', membreId)
    .select('id')
  if (error) throw traduireErreur(error, 'La modification n’a pas pu être enregistrée.')
  if (!data?.length) {
    throw new Error('Vous n’avez pas les droits nécessaires pour modifier ce membre.')
  }
}

// { max_users (null = illimité), active_members, valid_invitations }
export async function chargerPlaces(orgId) {
  const { data, error } = await client().rpc('org_seats', { p_org_id: orgId })
  if (error) throw traduireErreur(error, 'Impossible de lire le nombre d’utilisateurs.')
  return (Array.isArray(data) ? data[0] : data) ?? null
}

// --- Fiches ------------------------------------------------------------------

const COLONNES_FICHE =
  'id, membership_id, job_title, professional_number, phone, emergency_contact_name, ' +
  'emergency_contact_phone, start_date, contract_type, updated_at'

// Fiche d'un membre (owner et admin), créée avec son appartenance.
export async function chargerFiche(orgId, membreId) {
  const { data, error } = await client()
    .from('staff_files')
    .select(COLONNES_FICHE)
    .eq('org_id', orgId)
    .eq('membership_id', membreId)
    .is('deleted_at', null)
    .maybeSingle()
  if (error) throw traduireErreur(error, 'Impossible de charger la fiche.')
  return data
}

// Fiche de l'utilisateur connecté dans la structure.
export async function chargerMaFiche(orgId, userId) {
  const { data, error } = await client()
    .from('staff_files')
    .select(`${COLONNES_FICHE}, memberships!inner (user_id)`)
    .eq('org_id', orgId)
    .eq('memberships.user_id', userId)
    .is('deleted_at', null)
    .maybeSingle()
  if (error) throw traduireErreur(error, 'Impossible de charger votre fiche.')
  return data
}

// champs : colonnes de staff_files. Un membre ne peut changer que phone et
// emergency_contact_* (règle tenue par la base).
export async function modifierFiche(ficheId, champs) {
  const { data, error } = await client()
    .from('staff_files')
    .update(champs)
    .eq('id', ficheId)
    .select(COLONNES_FICHE)
  if (error) throw traduireErreur(error, 'La fiche n’a pas pu être enregistrée. Réessayez.')
  if (!data?.length) {
    throw new Error('Vous n’avez pas les droits nécessaires pour modifier cette fiche.')
  }
  return data[0]
}

// --- Pièces jointes ------------------------------------------------------------

const BUCKET_PERSONNEL = 'personnel'
// Durée de validité d'un lien d'ouverture : assez pour l'ouvrir, trop court pour circuler.
const DUREE_URL_SIGNEE = 120

export async function chargerPieces(ficheId) {
  const { data, error } = await client()
    .from('staff_attachments')
    .select('id, label, file_name, mime_type, size_bytes, storage_path, created_at')
    .eq('staff_file_id', ficheId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
  if (error) throw traduireErreur(error, 'Impossible de charger les pièces jointes.')
  return data ?? []
}

// Fichier rangé sous {org}/{fiche}/ avec un nom neuf : jamais de remplacement.
export async function envoyerPiece(orgId, ficheId, fichier, libelle) {
  const extension =
    fichier.name
      .split('.')
      .pop()
      ?.toLowerCase()
      .replace(/[^a-z0-9]/g, '') || 'bin'
  const chemin = `${orgId}/${ficheId}/${crypto.randomUUID()}.${extension}`
  const { error: erreurDepot } = await client()
    .storage.from(BUCKET_PERSONNEL)
    .upload(chemin, fichier, { contentType: fichier.type, upsert: false })
  if (erreurDepot) {
    throw traduireErreur(
      erreurDepot,
      'Le fichier n’a pas pu être envoyé. Vérifiez votre connexion.',
    )
  }
  const { error } = await client()
    .from('staff_attachments')
    .insert({
      org_id: orgId,
      staff_file_id: ficheId,
      label: libelle.trim(),
      file_name: fichier.name.slice(0, 200),
      mime_type: fichier.type,
      size_bytes: fichier.size,
      storage_path: chemin,
    })
  if (error) throw traduireErreur(error, 'La pièce jointe n’a pas pu être enregistrée.')
}

export async function urlPiece(chemin) {
  const { data, error } = await client()
    .storage.from(BUCKET_PERSONNEL)
    .createSignedUrl(chemin, DUREE_URL_SIGNEE)
  if (error) throw traduireErreur(error, 'Ce fichier n’a pas pu être ouvert. Réessayez.')
  return data.signedUrl
}

// Retrait doux : la ligne est marquée, le fichier reste dans le bucket.
export async function retirerPiece(pieceId) {
  const { data, error } = await client()
    .from('staff_attachments')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', pieceId)
    .select('id')
  if (error) throw traduireErreur(error, 'La pièce jointe n’a pas pu être retirée.')
  if (!data?.length) throw new Error('Vous n’avez pas les droits nécessaires pour la retirer.')
}

// --- Invitations -------------------------------------------------------------

export async function chargerInvitations(orgId) {
  const { data, error } = await client()
    .from('invitations')
    .select(
      'id, role, full_name, phone, email, channel, status, expires_at, accepted_at, created_at',
    )
    .eq('org_id', orgId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
  if (error) throw traduireErreur(error, 'Impossible de charger les invitations.')
  return data ?? []
}

// Personnes notées dans l'assistant de démarrage, pas encore invitées.
export async function chargerAEnvoyer(orgId) {
  const { data, error } = await client()
    .from('pending_invitations')
    .select('id, full_name, phone, email, role')
    .eq('org_id', orgId)
    .eq('status', 'pending')
    .is('deleted_at', null)
    .order('created_at')
  if (error) throw traduireErreur(error, 'Impossible de charger l’équipe notée au démarrage.')
  return data ?? []
}

function premiereLigne(data) {
  return (Array.isArray(data) ? data[0] : data) ?? null
}

// Renvoie { invitation_id, token, expires_at } : le jeton n'est lisible qu'ici, une fois.
// invitation : { role, full_name, phone, email } ou { pendingId }.
export async function creerInvitation(orgId, invitation, canal = 'whatsapp') {
  const { data, error } = await client().rpc('create_invitation', {
    p_org_id: orgId,
    p_role: invitation.role ?? null,
    p_full_name: invitation.full_name ?? null,
    p_phone: invitation.phone || null,
    p_email: invitation.email?.trim() || null,
    p_channel: canal,
    p_pending_id: invitation.pendingId ?? null,
  })
  if (error) throw traduireErreur(error, 'L’invitation n’a pas pu être créée. Réessayez.')
  return premiereLigne(data)
}

// Nouveau lien (perdu ou expiré) ; l'ancien cesse de fonctionner.
export async function renouvelerInvitation(invitationId, canal) {
  const { data, error } = await client().rpc('renew_invitation', {
    p_invitation_id: invitationId,
    p_channel: canal ?? null,
  })
  if (error) throw traduireErreur(error, 'Le nouveau lien n’a pas pu être créé. Réessayez.')
  return premiereLigne(data)
}

export async function annulerInvitation(invitationId) {
  const { error } = await client().rpc('revoke_invitation', { p_invitation_id: invitationId })
  if (error) throw traduireErreur(error, 'L’invitation n’a pas pu être annulée. Réessayez.')
}

// Envoi par e-mail (Edge Function invite-member). Renvoie { envoye, lien, message, … } :
// sans SMTP configuré, envoye = false mais l'invitation et son lien existent.
// demande : { invitation_id } | { pending_id } | { role, full_name, email, phone }.
export async function envoyerParEmail(orgId, demande) {
  const { data, error } = await client().functions.invoke('invite-member', {
    body: { ...demande, org_id: orgId, origine: window.location.origin },
  })
  if (error) throw await erreurFonction(error, 'L’invitation n’a pas pu être envoyée. Réessayez.')
  return data
}

// --- Page publique /invitation/:jeton ------------------------------------------

// { status, org_name, org_type, role, full_name, email, expires_at }
export async function lireInvitationPublique(jeton) {
  const { data, error } = await client().rpc('get_invitation_public', { p_token: jeton })
  if (error) throw traduireErreur(error, 'Cette invitation n’a pas pu être lue. Réessayez.')
  return premiereLigne(data) ?? { status: 'unknown' }
}

// Compte déjà connecté. Renvoie l'id de la structure rejointe.
export async function accepterInvitation(jeton) {
  const { data, error } = await client().rpc('accept_invitation', { p_token: jeton })
  if (error) throw traduireErreur(error, 'Vous n’avez pas pu rejoindre la structure. Réessayez.')
  return data
}

// Nouveau compte, créé confirmé par l'Edge Function. Erreur code « compte_existant » si
// l'adresse a déjà un compte (rien n'est alors créé ni modifié).
export async function creerCompteInvite(jeton, compte) {
  const { data, error } = await client().functions.invoke('accept-invitation', {
    body: {
      jeton,
      nom_complet: compte.nomComplet.trim(),
      telephone: compte.telephone || null,
      email: compte.email.trim(),
      mot_de_passe: compte.motDePasse,
    },
  })
  if (error) throw await erreurFonction(error, 'Votre compte n’a pas pu être créé. Réessayez.')
  return data
}
