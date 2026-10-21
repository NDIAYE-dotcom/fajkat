// Structures (organisations) de l'utilisateur connecté : lecture, création, création différée.
// La RLS ne renvoie que les structures dont l'utilisateur est membre actif.

import { MESSAGE_INDISPONIBLE, traduireErreur } from './erreursAuth.js'
import { supabase } from './supabase.js'

function client() {
  if (!supabase) throw new Error(MESSAGE_INDISPONIBLE)
  return supabase
}

export function cleStructures(userId) {
  return ['structures', userId]
}

// [{ id, name, type, status, trial_ends_at, timezone, country_code, region, logo_url, settings,
//    role, exerce }] — exerce : owner ou admin qui exerce une profession soignante (is_clinician).
export async function chargerStructures(userId) {
  const { data, error } = await client()
    .from('memberships')
    .select(
      'role, is_clinician, organization:organizations (id, name, type, status, trial_ends_at, timezone, country_code, region, logo_url, settings, deleted_at)',
    )
    .eq('user_id', userId)
    .eq('is_active', true)
    .is('deleted_at', null)
  if (error) {
    throw traduireErreur(
      error,
      'Impossible de charger votre structure. Vérifiez votre connexion puis réessayez.',
    )
  }
  return (data ?? [])
    .filter((ligne) => ligne.organization && !ligne.organization.deleted_at)
    .map(({ role, is_clinician, organization }) => ({
      ...organization,
      role,
      exerce: Boolean(is_clinician),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
}

// structure : { name, type, country_code, region, health_district, commune }. Renvoie l'id.
export async function creerStructure(structure) {
  const { data, error } = await client().rpc('create_organization', {
    p_name: structure.name,
    p_type: structure.type,
    p_country_code: structure.country_code,
    p_region: structure.region,
    p_health_district: structure.health_district,
    p_commune: structure.commune,
  })
  if (error) throw traduireErreur(error, 'La structure n’a pas pu être créée. Réessayez.')
  return data
}

// Structure saisie à l'inscription, créée à la première connexion. Renvoie l'id ou null.
export async function finaliserStructureEnAttente() {
  const { data, error } = await client().rpc('finalize_pending_organization')
  if (error) {
    throw traduireErreur(
      error,
      'Votre structure n’a pas pu être créée. Vérifiez votre connexion puis réessayez.',
    )
  }
  return data
}

// Pays où Fajkat est ouvert (table countries, is_active).
export async function chargerPaysActifs() {
  const { data, error } = await client()
    .from('countries')
    .select('code, name')
    .eq('is_active', true)
    .order('name')
  if (error) {
    throw traduireErreur(error, 'Impossible de charger la liste des pays. Réessayez.')
  }
  return data ?? []
}
