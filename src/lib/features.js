// Fonctionnalités (feature flags) d'une structure, déduites de son offre côté serveur
// (fonction SQL org_features). Le contrôle qui fait foi reste celui des policies RLS
// (org_has_feature) : ici, on ne fait que masquer ce qui n'est pas inclus.

import { supabase } from './supabase.js'

// Les données de l'offre changent rarement : 10 minutes avant de les redemander.
export const DUREE_CACHE_FEATURES = 10 * 60 * 1000

export function cleFeatures(orgId) {
  return ['features', orgId]
}

// Renvoie la liste des codes de fonctionnalités de la structure, ex. ['caisse', 'patients', …].
// Liste vide si l'utilisateur n'est pas membre de la structure.
export async function chargerFeatures(orgId) {
  if (!supabase) {
    throw new Error('Le service est momentanément indisponible. Réessayez dans un instant.')
  }
  const { data, error } = await supabase.rpc('org_features', { p_org_id: orgId })
  if (error) {
    throw new Error(
      'Impossible de charger les modules de votre structure. Vérifiez votre connexion puis réessayez.',
      { cause: error },
    )
  }
  return data ?? []
}
