// Profil de l'utilisateur connecté (/app/profil) : nom, téléphone, mot de passe.
// Les pages n'appellent jamais Supabase directement : elles passent par ce fichier.

import { MESSAGE_INDISPONIBLE, traduireErreur } from './erreursAuth.js'
import { supabase } from './supabase.js'

function client() {
  if (!supabase) throw new Error(MESSAGE_INDISPONIBLE)
  return supabase
}

export const CLE_MON_PROFIL = (userId) => ['profil', userId]

export async function chargerMonProfil(userId) {
  const { data, error } = await client()
    .from('profiles')
    .select('full_name, phone')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw traduireErreur(error, 'Impossible de charger votre profil.')
  return data ?? { full_name: '', phone: null }
}

// Le nom est aussi gardé dans les métadonnées du compte : l'en-tête de l'application
// l'affiche sans requête supplémentaire.
export async function enregistrerMonProfil(userId, { nomComplet, telephone }) {
  const { error } = await client()
    .from('profiles')
    .update({ full_name: nomComplet, phone: telephone || null })
    .eq('id', userId)
  if (error) throw traduireErreur(error, 'Votre profil n’a pas pu être enregistré. Réessayez.')
  const { error: erreurCompte } = await client().auth.updateUser({
    data: { full_name: nomComplet },
  })
  if (erreurCompte) {
    throw traduireErreur(erreurCompte, 'Votre nom n’a pas pu être enregistré. Réessayez.')
  }
}

// Le mot de passe actuel est vérifié d'abord : sur un téléphone partagé, une session
// restée ouverte ne suffit pas pour changer le mot de passe d'un autre.
export async function changerMonMotDePasse(email, actuel, nouveau) {
  const { error: erreurVerif } = await client().auth.signInWithPassword({
    email,
    password: actuel,
  })
  if (erreurVerif) {
    const traduite = traduireErreur(erreurVerif, 'Le mot de passe n’a pas pu être vérifié.')
    if (traduite.code === 'invalid_credentials') {
      const erreur = new Error('Mot de passe actuel incorrect.')
      erreur.code = 'mot_de_passe_actuel'
      throw erreur
    }
    throw traduite
  }
  const { error } = await client().auth.updateUser({ password: nouveau })
  if (error) throw traduireErreur(error, 'Le mot de passe n’a pas pu être changé. Réessayez.')
}
