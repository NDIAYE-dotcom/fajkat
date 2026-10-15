// Page de registre papier recopiée dans une grille : une ligne = un patient, seulement
// les colonnes essentielles. Chaque ligne passe par la même vérification que l'import
// d'un fichier (validation.js). Le titulaire du téléphone et l'accord WhatsApp ne se
// recopient pas : l'accord se demande au patient en personne.

export const LIGNES_MAX = 60

// cle : champ de la ligne ; mode : clavier proposé sur tablette et téléphone.
export const COLONNES_REGISTRE = [
  { cle: 'nom', titre: 'Nom', autoCapitalize: 'characters' },
  { cle: 'prenom', titre: 'Prénom', autoCapitalize: 'words' },
  { cle: 'sexe', titre: 'Sexe', aide: 'F ou M', autoCapitalize: 'characters', court: true },
  {
    cle: 'ageNaissance',
    titre: 'Âge ou naissance',
    aide: '34, 8 mois ou 12/03/1994',
    mono: true,
  },
  { cle: 'telephone', titre: 'Téléphone', mode: 'tel', mono: true },
  { cle: 'quartier', titre: 'Quartier', autoCapitalize: 'words' },
  { cle: 'mere', titre: 'Prénom de la mère', autoCapitalize: 'words' },
  { cle: 'ancienNumero', titre: 'Ancien n°', mono: true, court: true },
]

const CHAMPS = COLONNES_REGISTRE.map((c) => c.cle)

export function ligneVide(id) {
  return { id, ...Object.fromEntries(CHAMPS.map((c) => [c, ''])) }
}

export const SAISIE_VIDE = { annee: '', page: '', lignes: [ligneVide(1)] }

export function estVide(ligne) {
  return CHAMPS.every((c) => !String(ligne[c] ?? '').trim())
}

export function prochainId(lignes) {
  return lignes.reduce((max, l) => Math.max(max, l.id), 0) + 1
}

// « 12/03/1994 » ou « 1994-03-12 » est une date ; « 34 », « 8 mois » est un âge.
const RESSEMBLE_A_UNE_DATE = /^\d{1,4}[/-]\d{1,2}[/-]\d{1,4}$/

// Ligne de la grille -> valeurs attendues par validerLigne.
export function versValeurs(ligne) {
  const ageNaissance = String(ligne.ageNaissance ?? '').trim()
  const estDate = RESSEMBLE_A_UNE_DATE.test(ageNaissance.replace(/\s/g, ''))
  return {
    nom: ligne.nom,
    prenom: ligne.prenom,
    sexe: ligne.sexe,
    naissance: estDate ? ageNaissance.replace(/\s/g, '') : '',
    age: estDate ? '' : ageNaissance,
    telephone: ligne.telephone,
    quartier: ligne.quartier,
    mere: ligne.mere,
    ancienNumero: ligne.ancienNumero,
  }
}

// Lignes non vides de la grille -> lignes lues (numéro = rang dans la grille).
export function lignesLues(lignes) {
  return lignes
    .map((l, index) => ({ ligne: l, numero: index + 1 }))
    .filter(({ ligne }) => !estVide(ligne))
    .map(({ ligne, numero }) => ({
      numero,
      id: ligne.id,
      valeurs: versValeurs(ligne),
      brut: CHAMPS.map((c) => ligne[c]),
    }))
}

// Repère « Registre de l'année ___, page ___ » : nombres entiers, ou null.
export function lireRepere({ annee, page }) {
  const a = String(annee ?? '').trim()
  const p = String(page ?? '').trim()
  const erreurs = {}
  const anneeLue = a ? Number(a) : null
  const pageLue = p ? Number(p) : null
  if (a && !(/^\d{4}$/.test(a) && anneeLue >= 1900 && anneeLue <= 2100)) {
    erreurs.annee = 'Année sur 4 chiffres, par exemple 2019.'
  }
  if (p && !(/^\d{1,5}$/.test(p) && pageLue >= 1 && pageLue <= 10000)) {
    erreurs.page = 'Numéro de page entre 1 et 10 000.'
  }
  return { annee: anneeLue, page: pageLue, erreurs }
}

// Libellé du repère, pour l'aperçu et le bilan.
export function libelleRepere({ annee, page }) {
  if (annee && page) return `Registre ${annee}, page ${page}`
  if (annee) return `Registre ${annee}`
  if (page) return `Registre, page ${page}`
  return 'Page de registre'
}
