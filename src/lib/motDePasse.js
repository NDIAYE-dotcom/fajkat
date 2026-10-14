// Règles du mot de passe, identiques à celles réglées dans Supabase
// (Auth → Providers → Email) : 8 caractères minimum, au moins une lettre et un chiffre.

export const REGLES_MOT_DE_PASSE = [
  { id: 'longueur', libelle: 'Au moins 8 caractères', respectee: (m) => m.length >= 8 },
  { id: 'lettre', libelle: 'Au moins une lettre (a à z)', respectee: (m) => /[a-z]/i.test(m) },
  { id: 'chiffre', libelle: 'Au moins un chiffre', respectee: (m) => /\d/.test(m) },
]

export function estMotDePasseValide(motDePasse) {
  return REGLES_MOT_DE_PASSE.every((regle) => regle.respectee(motDePasse))
}

export const MESSAGE_MOT_DE_PASSE =
  'Choisissez un mot de passe d’au moins 8 caractères, avec au moins une lettre et un chiffre.'

const MOTIF_EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export function estEmailValide(email) {
  return MOTIF_EMAIL.test(email.trim())
}
