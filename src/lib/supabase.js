import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

if (!supabaseConfigured) {
  // On ne bloque pas l'application : les pages publiques restent consultables.
  console.error(
    'Supabase n’est pas configuré : renseignez VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY dans .env.local (voir .env.example).',
  )
}

// Client unique, à n'utiliser que depuis les fichiers api.js des modules (et src/lib).
// Flux PKCE. Les liens des e-mails arrivent sur /auth/confirmer, qui les traite lui-même
// (detectSessionInUrl: false) :
// - liens par défaut de Supabase (?code=…) -> exchangeCodeForSession ;
// - modèles Fajkat, actifs avec un SMTP personnalisé (?token_hash=…&type=…) -> verifyOtp.
export const supabase = supabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: { flowType: 'pkce', detectSessionInUrl: false },
    })
  : null
