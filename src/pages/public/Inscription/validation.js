import {
  estEmailValide,
  estMotDePasseValide,
  MESSAGE_MOT_DE_PASSE,
} from '../../../lib/motDePasse.js'
import { getOffre } from '../../../lib/offres.js'
import { estTelephoneValide } from '../../../lib/pays.js'

// Saisie gardée en brouillon (jamais le mot de passe).
export const INSCRIPTION_VIDE = {
  compte: { nomComplet: '', telephone: '', email: '' },
  structure: {
    type: '',
    name: '',
    country_code: 'SN',
    region: '',
    health_district: '',
    commune: '',
  },
}

// Ordre des champs à l'écran : le focus va sur la première erreur.
export const ORDRE_COMPTE = ['nomComplet', 'telephone', 'email', 'motDePasse']
export const ORDRE_STRUCTURE = ['type', 'name', 'country_code', 'region']

export function validerCompte(compte, motDePasse) {
  const erreurs = {}
  if (compte.nomComplet.trim().length < 2)
    erreurs.nomComplet = 'Saisissez votre prénom et votre nom.'
  if (!compte.telephone) erreurs.telephone = 'Saisissez votre numéro de téléphone.'
  else if (!estTelephoneValide(compte.telephone))
    erreurs.telephone = 'Numéro incomplet : vérifiez le nombre de chiffres.'
  if (!estEmailValide(compte.email))
    erreurs.email = 'Saisissez une adresse e-mail valide, par exemple awa.diop@gmail.com.'
  if (!estMotDePasseValide(motDePasse)) erreurs.motDePasse = MESSAGE_MOT_DE_PASSE
  return erreurs
}

export function validerStructure(structure) {
  const erreurs = {}
  if (!getOffre(structure.type)) erreurs.type = 'Choisissez le type de votre structure.'
  const nom = structure.name.trim()
  if (nom.length < 2) erreurs.name = 'Saisissez le nom de votre structure.'
  else if (nom.length > 200) erreurs.name = 'Le nom ne doit pas dépasser 200 caractères.'
  if (!structure.country_code) erreurs.country_code = 'Choisissez le pays.'
  if (!structure.region.trim()) erreurs.region = 'Choisissez la région.'
  return erreurs
}

// Données envoyées à Supabase : espaces superflus retirés, champs vides à null.
export function nettoyerStructure(structure) {
  const texte = (valeur) => valeur.trim() || null
  return {
    type: structure.type,
    name: structure.name.trim(),
    country_code: structure.country_code,
    region: texte(structure.region),
    health_district: texte(structure.health_district),
    commune: texte(structure.commune),
  }
}
