// Fiche patient : libellés, passage dossier <-> formulaire de modification, lecture du
// journal des modifications de l'identité.

import { formatDate, formatTelephone } from '../../lib/format.js'
import { SITE } from '../../lib/partage.js'
import { estTelephoneValide } from '../../lib/pays.js'
import {
  libelleTitulaire,
  ORDRE_CHAMPS,
  SAISIE_VIDE,
  saisieVersPatient,
  validerSaisie,
} from './utils.js'

export const ETATS_CIVILS = [
  { valeur: 'celibataire', libelle: 'Célibataire' },
  { valeur: 'marie', libelle: 'Marié(e)' },
  { valeur: 'divorce', libelle: 'Divorcé(e)' },
  { valeur: 'veuf', libelle: 'Veuf ou veuve' },
  { valeur: 'autre', libelle: 'Autre' },
]

export const LANGUES = [
  { valeur: 'fr', libelle: 'Français' },
  { valeur: 'wo', libelle: 'Wolof' },
  { valeur: 'ff', libelle: 'Pulaar' },
  { valeur: 'srr', libelle: 'Sérère' },
  { valeur: 'dyo', libelle: 'Diola' },
  { valeur: 'mnk', libelle: 'Mandinka' },
  { valeur: 'snk', libelle: 'Soninké' },
  { valeur: 'autre', libelle: 'Autre langue' },
]

// Régimes de prise en charge. « tiers » : un tiers payant de la structure peut être choisi.
export const REGIMES = [
  { valeur: 'sen_csu', libelle: 'SEN-CSU (couverture maladie universelle)', tiers: true },
  { valeur: 'mutuelle', libelle: 'Mutuelle de santé', tiers: true },
  { valeur: 'ipm', libelle: 'IPM (entreprise)', tiers: true },
  { valeur: 'assurance', libelle: 'Assurance privée', tiers: true },
  { valeur: 'indigent', libelle: 'Indigent (prise en charge sociale)', tiers: false },
]

export const GROUPES_SANGUINS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((g) => ({
  valeur: g,
  libelle: g,
}))

export const libelleDe = (liste, valeur) => liste.find((e) => e.valeur === valeur)?.libelle ?? ''

// --- Formulaire de modification ----------------------------------------------

export const COMPLEMENT_VIDE = {
  telephone2: '',
  commune: '',
  profession: '',
  etatCivil: '',
  nomMere: '',
  urgenceNom: '',
  urgenceTel: '',
  urgenceLien: '',
  langue: 'fr',
}

// Une date estimée (enfant) s'affiche comme une date : la renvoyer telle quelle évite de
// la recalculer à chaque modification. Un âge déclaré reste un âge.
function naissanceDe(p) {
  if (p.birth_date) {
    return { type: 'date', date: p.birth_date, texte: formatDate(p.birth_date) }
  }
  return { type: 'age', age: p.declared_age, unite: 'ans' }
}

export function patientVersSaisie(p) {
  return {
    ...SAISIE_VIDE,
    ...COMPLEMENT_VIDE,
    nom: p.last_name,
    prenom: p.first_name,
    sexe: p.sex,
    naissance: naissanceDe(p),
    telephone: p.phone ?? '',
    titulaire: p.phone_owner ?? '',
    quartier: p.neighborhood ?? '',
    mere: p.mother_first_name ?? '',
    ancienNumero: p.legacy_file_number ?? '',
    consentement: p.whatsapp_consent === null ? '' : p.whatsapp_consent ? 'oui' : 'non',
    telephone2: p.phone_secondary ?? '',
    commune: p.commune ?? '',
    profession: p.occupation ?? '',
    etatCivil: p.marital_status ?? '',
    nomMere: p.mother_last_name ?? '',
    urgenceNom: p.emergency_contact_name ?? '',
    urgenceTel: p.emergency_contact_phone ?? '',
    urgenceLien: p.emergency_contact_relation ?? '',
    langue: p.preferred_language ?? 'fr',
  }
}

const texte = (v) => {
  const propre = (v ?? '').trim().replace(/\s+/g, ' ')
  return propre === '' ? null : propre
}

function saisieVersLigne(s) {
  return {
    ...saisieVersPatient(s),
    phone_secondary: s.telephone2 || null,
    commune: texte(s.commune),
    occupation: texte(s.profession),
    marital_status: s.etatCivil || null,
    mother_last_name: texte(s.nomMere),
    emergency_contact_name: texte(s.urgenceNom),
    emergency_contact_phone: s.urgenceTel || null,
    emergency_contact_relation: texte(s.urgenceLien),
    preferred_language: s.langue || 'fr',
  }
}

const CHAMPS_NAISSANCE = ['birth_date', 'birth_date_estimated', 'declared_age']

// Seuls les champs modifiés partent vers la base : le journal reste lisible, et une
// naissance non touchée n'est jamais recalculée (âge déclaré, date estimée).
export function modificationsDe(saisie, patient) {
  const ligne = saisieVersLigne(saisie)
  const naissanceTouchee = JSON.stringify(saisie.naissance) !== JSON.stringify(naissanceDe(patient))
  const champs = {}
  for (const [cle, valeur] of Object.entries(ligne)) {
    if (CHAMPS_NAISSANCE.includes(cle)) continue
    if ((patient[cle] ?? null) !== valeur) champs[cle] = valeur
  }
  if (naissanceTouchee) {
    for (const cle of CHAMPS_NAISSANCE) champs[cle] = ligne[cle]
  }
  return champs
}

export function validerFiche(saisie) {
  const erreurs = validerSaisie(saisie)
  if (saisie.telephone2 && !estTelephoneValide(saisie.telephone2)) {
    erreurs.telephone2 = 'Numéro incomplet : vérifiez le nombre de chiffres.'
  }
  if (saisie.urgenceTel && !estTelephoneValide(saisie.urgenceTel)) {
    erreurs.urgenceTel = 'Numéro incomplet : vérifiez le nombre de chiffres.'
  }
  return erreurs
}

export const ORDRE_CHAMPS_FICHE = [...ORDRE_CHAMPS, 'telephone2', 'urgenceTel']

// --- Journal des modifications ------------------------------------------------

const telephone = (v) => formatTelephone(v)
const CHAMPS_JOURNAL = {
  last_name: { libelle: 'Nom' },
  first_name: { libelle: 'Prénom' },
  sex: { libelle: 'Sexe', format: (v) => (v === 'F' ? 'Féminin' : 'Masculin') },
  birth_date: { libelle: 'Date de naissance', format: formatDate },
  birth_date_estimated: { libelle: 'Date estimée', format: (v) => (v ? 'oui' : 'non') },
  declared_age: { libelle: 'Âge déclaré', format: (v) => `${v} ans` },
  phone: { libelle: 'Téléphone', format: telephone },
  phone_owner: { libelle: 'Titulaire du téléphone', format: libelleTitulaire },
  phone_secondary: { libelle: 'Second téléphone', format: telephone },
  neighborhood: { libelle: 'Quartier ou village' },
  commune: { libelle: 'Commune' },
  occupation: { libelle: 'Profession' },
  marital_status: { libelle: 'Situation familiale', format: (v) => libelleDe(ETATS_CIVILS, v) },
  mother_first_name: { libelle: 'Prénom de la mère' },
  mother_last_name: { libelle: 'Nom de la mère' },
  emergency_contact_name: { libelle: 'Personne à prévenir' },
  emergency_contact_phone: { libelle: 'Téléphone de la personne à prévenir', format: telephone },
  emergency_contact_relation: { libelle: 'Lien avec le patient' },
  preferred_language: { libelle: 'Langue', format: (v) => libelleDe(LANGUES, v) },
  whatsapp_consent: {
    libelle: 'Rappels WhatsApp',
    format: (v) => (v ? 'accepte' : 'refuse'),
  },
  legacy_file_number: { libelle: 'Ancien n° de dossier' },
}

function valeurLisible(cle, valeur) {
  if (valeur === null || valeur === undefined || valeur === '') return 'vide'
  const format = CHAMPS_JOURNAL[cle].format
  return format ? format(valeur) : String(valeur)
}

// Une entrée du journal en lignes lisibles : [{ libelle, avant, apres }], ou un résumé
// (« Dossier créé », « Nouvelle photo », « Dossier fusionné », « Dossier … fusionné dans
// ce dossier » avec son motif).
export function lireEntreeJournal(entree) {
  if (entree.action === 'INSERT') return { resume: 'Dossier créé', changements: [] }
  if (entree.action === 'FUSION') {
    const f = entree.fusion
    const nom = `${f.last_name.toLocaleUpperCase('fr')} ${f.first_name}`.trim()
    return {
      resume: `Dossier ${f.file_number} (${nom}) fusionné dans ce dossier`,
      motif: f.motif,
      changements: [],
    }
  }
  const avant = entree.old_data ?? {}
  const apres = entree.new_data ?? {}
  if (!avant.merged_into_id && apres.merged_into_id) {
    return { resume: 'Dossier fusionné dans un autre dossier', changements: [] }
  }
  const changements = Object.keys(CHAMPS_JOURNAL)
    .filter((cle) => JSON.stringify(avant[cle] ?? null) !== JSON.stringify(apres[cle] ?? null))
    .map((cle) => ({
      libelle: CHAMPS_JOURNAL[cle].libelle,
      avant: valeurLisible(cle, avant[cle]),
      apres: valeurLisible(cle, apres[cle]),
    }))
  const photo = avant.photo_path !== apres.photo_path
  return { resume: photo ? 'Nouvelle photo' : null, changements }
}

// --- Carte patient -----------------------------------------------------------

// Adresse imprimée dans le QR de la carte. Elle vient du seul réglage SITE.url : au
// passage à un vrai nom de domaine, l'ancienne adresse devra rediriger vers la nouvelle
// pour que les cartes déjà imprimées restent valables. Aucune donnée du patient dans
// l'adresse : l'identifiant est aléatoire, et la fiche exige une session et l'appartenance
// à la structure.
export function adresseDossier(id) {
  return `${SITE.url.replace(/\/+$/, '')}/app/patients/${id}`
}
