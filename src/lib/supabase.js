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

// Client unique, à n'utiliser que depuis les fichiers api.js des modules.
export const supabase = supabaseConfigured ? createClient(supabaseUrl, supabaseAnonKey) : null
