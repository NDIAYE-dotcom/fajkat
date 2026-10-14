// Outils communs aux Edge Functions de Fajkat (JavaScript pur, exécuté par Deno).

import { createClient } from 'npm:@supabase/supabase-js@2.109.0'

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export function repondre(statut, corps) {
  return new Response(JSON.stringify(corps), {
    status: statut,
    headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' },
  })
}

// Erreur affichable telle quelle par l'application (message en français).
export function refuser(statut, code, message) {
  return repondre(statut, { code, message })
}

export const MESSAGE_GENERIQUE =
  'Le service est momentanément indisponible. Réessayez dans un instant.'

const URL_PROJET = Deno.env.get('SUPABASE_URL')
const CLE_ANON = Deno.env.get('SUPABASE_ANON_KEY')
const CLE_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

const SANS_SESSION = { auth: { persistSession: false, autoRefreshToken: false } }

// Client aux droits de l'appelant : RLS et droits des fonctions SQL s'appliquent.
export function clientAppelant(autorisation) {
  return createClient(URL_PROJET, CLE_ANON, {
    ...SANS_SESSION,
    global: { headers: autorisation ? { Authorization: autorisation } : {} },
  })
}

// Client serveur : uniquement pour l'administration des comptes (auth.admin).
export function clientServeur() {
  return createClient(URL_PROJET, CLE_SERVICE, SANS_SESSION)
}

// Adresse du site d'où vient la demande, pour construire le lien d'invitation.
// Supabase Auth refuse de toute façon une redirection hors de la liste autorisée
// (Auth → URL Configuration) ; on la filtre ici aussi.
const SITES_AUTORISES = (
  Deno.env.get('FAJKAT_SITE_URLS') ?? 'https://fajkat.vercel.app,http://localhost:5173'
)
  .split(',')
  .map((s) => s.trim().replace(/\/$/, ''))
  .filter(Boolean)

export function origineSure(origine) {
  const propre = String(origine ?? '').replace(/\/$/, '')
  return SITES_AUTORISES.includes(propre) ? propre : SITES_AUTORISES[0]
}

export async function lireCorps(requete) {
  try {
    const corps = await requete.json()
    return corps && typeof corps === 'object' ? corps : {}
  } catch {
    return {}
  }
}
