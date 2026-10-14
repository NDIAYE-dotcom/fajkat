// Accès aux données du module admin : identité de la structure, réglages, équipe en attente,
// services et tarifs, tiers payants. La RLS limite tout à la structure de l'utilisateur ;
// seuls owner et admin peuvent écrire.

import { MESSAGE_INDISPONIBLE, traduireErreur } from '../../lib/erreursAuth.js'
import { supabase } from '../../lib/supabase.js'

const BUCKET_LOGOS = 'logos'

function client() {
  if (!supabase) throw new Error(MESSAGE_INDISPONIBLE)
  return supabase
}

// Erreurs propres aux données (contraintes SQL), avant la traduction commune.
function erreurDonnees(erreur, repli) {
  if (erreur?.code === '23505') {
    return new Error('Deux lignes portent le même nom. Modifiez l’une d’elles, puis réessayez.', {
      cause: erreur,
    })
  }
  if (erreur?.code === '23514') {
    return new Error('Certaines informations ne sont pas valides. Vérifiez votre saisie.', {
      cause: erreur,
    })
  }
  return traduireErreur(erreur, repli)
}

export const cles = {
  fiche: (orgId) => ['admin', 'fiche', orgId],
  modelesServices: (type) => ['admin', 'modeles-services', type],
  services: (orgId) => ['admin', 'services', orgId],
  tiersPayants: (orgId) => ['admin', 'tiers-payants', orgId],
  invitations: (orgId) => ['admin', 'invitations', orgId],
}

// --- Identité et réglages ----------------------------------------------------

export async function chargerFiche(orgId) {
  const { data, error } = await client()
    .from('organizations')
    .select('id, name, type, address, phone, email, authorization_number, logo_url, settings')
    .eq('id', orgId)
    .single()
  if (error) throw traduireErreur(error, 'Impossible de charger votre structure. Réessayez.')
  return data
}

// champs : { address, phone, email, authorization_number, logo_url } (null si vide).
export async function enregistrerIdentite(orgId, champs) {
  const { error } = await client().from('organizations').update(champs).eq('id', orgId)
  if (error) throw erreurDonnees(error, 'Les informations n’ont pas pu être enregistrées.')
}

// Fusionne des clés dans organizations.settings ; renvoie les réglages à jour.
export async function majReglages(orgId, patch) {
  const { data, error } = await client().rpc('update_org_settings', {
    p_org_id: orgId,
    p_patch: patch,
  })
  if (error) throw traduireErreur(error, 'La progression n’a pas pu être enregistrée.')
  return data
}

// Logo déjà recadré et compressé (Blob). Un nouveau nom à chaque envoi : le cache
// ne sert jamais l'ancien logo. Renvoie l'adresse publique.
export async function envoyerLogo(orgId, blob) {
  const extension = blob.type === 'image/webp' ? 'webp' : 'jpg'
  const chemin = `${orgId}/logo-${Date.now()}.${extension}`
  const { error } = await client()
    .storage.from(BUCKET_LOGOS)
    .upload(chemin, blob, { contentType: blob.type, upsert: false, cacheControl: '31536000' })
  if (error) {
    throw traduireErreur(error, 'Le logo n’a pas pu être envoyé. Vérifiez votre connexion.')
  }
  return client().storage.from(BUCKET_LOGOS).getPublicUrl(chemin).data.publicUrl
}

// --- Services et tarifs ------------------------------------------------------

export async function chargerModelesServices(type) {
  const { data, error } = await client()
    .from('service_templates')
    .select('code, label, category, sort_order')
    .eq('plan_code', type)
    .eq('is_active', true)
    .order('sort_order')
  if (error) throw traduireErreur(error, 'Impossible de charger la liste des services.')
  return data ?? []
}

export async function chargerServices(orgId) {
  const { data, error } = await client()
    .from('services')
    .select('id, template_code, label, category, price, is_active, sort_order')
    .eq('org_id', orgId)
    .is('deleted_at', null)
    .order('sort_order')
  if (error) throw traduireErreur(error, 'Impossible de charger vos services.')
  return data ?? []
}

// lignes : [{ id, template_code, label, category, price, is_active, sort_order }]
// ou [{ id, removed: true }]. Rejouable : les identifiants viennent du navigateur.
export async function enregistrerServices(orgId, lignes) {
  const { error } = await client().rpc('save_services', { p_org_id: orgId, p_rows: lignes })
  if (error) throw erreurDonnees(error, 'Vos services n’ont pas pu être enregistrés.')
}

// --- Tiers payants -----------------------------------------------------------

export async function chargerTiersPayants(orgId) {
  const { data, error } = await client()
    .from('payers')
    .select('id, kind, name, coverage_rate, is_active')
    .eq('org_id', orgId)
    .is('deleted_at', null)
    .order('created_at')
  if (error) throw traduireErreur(error, 'Impossible de charger vos tiers payants.')
  return data ?? []
}

export async function enregistrerTiersPayants(orgId, lignes) {
  const { error } = await client().rpc('save_payers', { p_org_id: orgId, p_rows: lignes })
  if (error) throw erreurDonnees(error, 'Vos tiers payants n’ont pas pu être enregistrés.')
}

// --- Équipe (invitations en attente) -----------------------------------------

export async function chargerInvitations(orgId) {
  const { data, error } = await client()
    .from('pending_invitations')
    .select('id, full_name, phone, email, role, status')
    .eq('org_id', orgId)
    .is('deleted_at', null)
    .order('created_at')
  if (error) throw traduireErreur(error, 'Impossible de charger votre équipe.')
  return data ?? []
}

export async function enregistrerInvitations(orgId, lignes) {
  const { error } = await client().rpc('save_pending_invitations', {
    p_org_id: orgId,
    p_rows: lignes,
  })
  if (error) throw erreurDonnees(error, 'Votre équipe n’a pas pu être enregistrée.')
}
