// Règles et libellés du registre des patients : affichage de l'âge et de la naissance,
// préparation de la saisie, validation, messages d'erreur en français.

import { traduireErreur } from '../../lib/erreursAuth.js'
import { ageDepuisNaissance, dayjs, formatDate, getFuseauHoraire } from '../../lib/format.js'
import { estTelephoneValide } from '../../lib/pays.js'

export const SEXES = [
  { valeur: 'F', libelle: 'Féminin' },
  { valeur: 'M', libelle: 'Masculin' },
]

// À qui appartient le téléphone : souvent celui de la mère ou du chef de famille.
export const TITULAIRES = [
  { valeur: 'patient', libelle: 'Le patient lui-même' },
  { valeur: 'mere', libelle: 'Sa mère' },
  { valeur: 'pere', libelle: 'Son père' },
  { valeur: 'conjoint', libelle: 'Son conjoint ou sa conjointe' },
  { valeur: 'autre', libelle: 'Une autre personne' },
]

const TITULAIRES_COURTS = {
  patient: 'le patient',
  mere: 'la mère',
  pere: 'le père',
  conjoint: 'le conjoint',
  autre: 'un proche',
}

export const RAISONS_DOUBLON = {
  meme_telephone: 'Même téléphone, nom proche',
  meme_mere: 'Même nom, même prénom de la mère',
  meme_nom_age: 'Même nom, âge proche',
}

// Avant 5 ans, l'âge déclaré (« 3 ans » ou « 8 mois ») donne une date de naissance
// estimée : le calendrier vaccinal a besoin d'une date, pas d'un âge arrondi.
// À partir de 5 ans, l'âge déclaré en années est enregistré tel quel.
export const AGE_ENFANT_ANS = 5
const MOIS_ENFANT = AGE_ENFANT_ANS * 12

export const SAISIE_VIDE = {
  nom: '',
  prenom: '',
  sexe: '',
  naissance: { type: 'date', date: null, texte: '' },
  telephone: '',
  titulaire: '',
  quartier: '',
  mere: '',
  consentement: '',
}

// --- Affichage ---------------------------------------------------------------

// « NDIAYE Fatou » : le nom de famille en capitales, comme dans les registres papier.
export function nomComplet(patient) {
  if (!patient) return ''
  return `${patient.last_name.toLocaleUpperCase('fr')} ${patient.first_name}`
}

export function libelleTitulaire(code) {
  return TITULAIRES_COURTS[code] ?? ''
}

function ne(patient) {
  return patient.sex === 'F' ? 'née' : 'né'
}

// « née le 12/03/1994 », « né vers juillet 2026 » (date estimée), « née vers 1996 » (âge déclaré).
export function libelleNaissance(patient) {
  if (patient.birth_date && patient.birth_date_estimated) {
    return `${ne(patient)} vers ${dayjs(patient.birth_date).format('MMMM YYYY')}`
  }
  if (patient.birth_date) return `${ne(patient)} le ${formatDate(patient.birth_date)}`
  if (patient.birth_year) return `${ne(patient)} vers ${patient.birth_year}`
  return ''
}

// « 3 ans », « 8 mois » ; « environ 30 ans » pour un âge déclaré.
export function libelleAge(patient) {
  if (patient.birth_date) {
    const age = ageDepuisNaissance(patient.birth_date)
    return patient.birth_date_estimated && age ? `environ ${age}` : age
  }
  if (patient.birth_year) {
    const ans = dayjs().tz(getFuseauHoraire()).year() - patient.birth_year
    return `environ ${ans} an${ans > 1 ? 's' : ''}`
  }
  return ''
}

// --- Saisie ------------------------------------------------------------------

function aujourdhui() {
  return dayjs().tz(getFuseauHoraire())
}

// Âge déclaré converti en mois (« 3 ans » -> 36).
function enMois({ age, unite }) {
  return unite === 'mois' ? age : age * 12
}

// Champs de naissance pour la base, d'après la valeur de DateInput.
//   moins de 5 ans (en ans ou en mois) : date estimée = aujourd'hui moins l'âge ;
//   5 ans et plus : âge déclaré en années (« 72 mois » -> 6 ans).
export function naissanceVersBase(naissance) {
  if (naissance.type === 'age' && enMois(naissance) < MOIS_ENFANT) {
    const date = aujourdhui().subtract(naissance.age, naissance.unite === 'mois' ? 'month' : 'year')
    return {
      birth_date: date.format('YYYY-MM-DD'),
      birth_date_estimated: true,
      declared_age: null,
    }
  }
  if (naissance.type === 'age') {
    return {
      birth_date: null,
      birth_date_estimated: false,
      declared_age: Math.floor(enMois(naissance) / 12),
    }
  }
  return { birth_date: naissance.date, birth_date_estimated: false, declared_age: null }
}

// Année de naissance (exacte ou estimée) pour la recherche de doublons ; null si inconnue.
export function anneeNaissance(naissance) {
  if (naissance.type === 'age') {
    if (naissance.age === null || naissance.age === undefined) return null
    const base = naissanceVersBase(naissance)
    return base.birth_date
      ? Number(base.birth_date.slice(0, 4))
      : aujourdhui().year() - base.declared_age
  }
  return naissance.date ? Number(naissance.date.slice(0, 4)) : null
}

function texte(valeur) {
  const propre = (valeur ?? '').trim().replace(/\s+/g, ' ')
  return propre === '' ? null : propre
}

// Ligne à insérer dans patients (org_id ajouté par l'api).
export function saisieVersPatient(saisie) {
  const telephone = saisie.telephone || null
  return {
    last_name: texte(saisie.nom),
    first_name: texte(saisie.prenom),
    sex: saisie.sexe,
    ...naissanceVersBase(saisie.naissance),
    phone: telephone,
    phone_owner: telephone ? saisie.titulaire : null,
    neighborhood: texte(saisie.quartier),
    mother_first_name: texte(saisie.mere),
    whatsapp_consent: telephone && saisie.consentement ? saisie.consentement === 'oui' : null,
  }
}

function erreurNaissance(naissance) {
  if (naissance.type === 'age') {
    if (naissance.age === null || naissance.age === undefined) return 'Indiquez l’âge déclaré.'
    return enMois(naissance) > 130 * 12 ? 'Âge invalide : 130 ans au plus.' : null
  }
  if (!naissance.texte) {
    return 'Indiquez la date de naissance, ou cochez « Date exacte inconnue » pour saisir l’âge.'
  }
  if (!naissance.date) return 'Date incomplète ou inexistante : JJ/MM/AAAA, par exemple 12/03/1994.'
  if (naissance.date > aujourdhui().format('YYYY-MM-DD')) {
    return 'La date de naissance ne peut pas être dans le futur.'
  }
  return null
}

// { champ: message } — vide si la saisie est complète.
export function validerSaisie(saisie) {
  const erreurs = {}
  if (!texte(saisie.nom)) erreurs.nom = 'Indiquez le nom de famille.'
  if (!texte(saisie.prenom)) erreurs.prenom = 'Indiquez le prénom.'
  if (!saisie.sexe) erreurs.sexe = 'Choisissez le sexe.'
  const naissance = erreurNaissance(saisie.naissance)
  if (naissance) erreurs.naissance = naissance
  if (saisie.telephone && !estTelephoneValide(saisie.telephone)) {
    erreurs.telephone = 'Numéro incomplet : vérifiez le nombre de chiffres.'
  }
  if (saisie.telephone && !saisie.titulaire) {
    erreurs.titulaire = 'Indiquez à qui appartient ce numéro.'
  }
  return erreurs
}

export const ORDRE_CHAMPS = ['nom', 'prenom', 'sexe', 'naissance', 'telephone', 'titulaire']

// --- Erreurs -----------------------------------------------------------------

const MESSAGES_CONTRAINTES = {
  patients_last_name_check: 'Nom manquant ou trop long (80 caractères au plus).',
  patients_first_name_check: 'Prénom manquant ou trop long (80 caractères au plus).',
  patients_sex_check: 'Choisissez le sexe : féminin ou masculin.',
  patients_birth_check: 'Indiquez la date de naissance ou l’âge déclaré.',
  patients_declared_age_check: 'Âge déclaré invalide (0 à 130 ans).',
  patients_birth_date_check: 'Date de naissance invalide.',
  patients_birth_estimated_check: 'Date de naissance estimée invalide.',
  patients_phone_check: 'Téléphone invalide. Vérifiez le numéro.',
  patients_phone_owner_check: 'Indiquez à qui appartient ce numéro.',
}

export function messageErreurPatient(erreur) {
  const contrainte = Object.keys(MESSAGES_CONTRAINTES).find((c) =>
    (erreur?.message ?? '').includes(c),
  )
  if (contrainte) {
    const traduite = new Error(MESSAGES_CONTRAINTES[contrainte], { cause: erreur })
    traduite.code = erreur.code
    return traduite
  }
  if (erreur?.code === '42501') {
    const traduite = new Error(
      'Enregistrement refusé : votre rôle ne permet pas de créer un patient, ou la structure est en lecture seule.',
      { cause: erreur },
    )
    traduite.code = erreur.code
    return traduite
  }
  return traduireErreur(erreur, 'Le patient n’a pas pu être enregistré. Réessayez.')
}
