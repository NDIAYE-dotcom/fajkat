// Vérification des lignes d'un fichier d'import, avec les règles de la création rapide :
// nom, prénom et sexe obligatoires ; date de naissance JJ/MM/AAAA ou AAAA-MM-JJ, ou âge
// déclaré (en ans, ou en mois avant 5 ans : date estimée) ; téléphone mis au format E.164.
// Le titulaire du téléphone et l'accord WhatsApp restent « non renseignés » s'ils ne sont
// pas écrits dans le fichier : jamais de valeur par défaut.

import { dayjs, getFuseauHoraire, lireDateFr } from '../../../lib/format.js'
import {
  estTelephoneValide,
  longueurNationale,
  PAYS_PAR_DEFAUT,
  paysParCode,
} from '../../../lib/pays.js'
import { naissanceVersBase } from '../utils.js'
import { normaliserEntete } from './colonnes.js'

const SEXES = {
  f: 'F',
  femme: 'F',
  feminin: 'F',
  fille: 'F',
  m: 'M',
  h: 'M',
  homme: 'M',
  masculin: 'M',
  garcon: 'M',
}

const TITULAIRES = {
  patient: 'patient',
  'le patient': 'patient',
  'lui meme': 'patient',
  'elle meme': 'patient',
  mere: 'mere',
  'sa mere': 'mere',
  maman: 'mere',
  pere: 'pere',
  'son pere': 'pere',
  papa: 'pere',
  conjoint: 'conjoint',
  conjointe: 'conjoint',
  epoux: 'conjoint',
  epouse: 'conjoint',
  mari: 'conjoint',
  autre: 'autre',
  proche: 'autre',
}

const OUI = ['oui', 'o', 'yes', 'y', 'accepte', 'accord', 'x', '1', 'vrai', 'true']
const NON = ['non', 'n', 'no', 'refuse', '0', 'faux', 'false']

const LONGUEURS = {
  ancienNumero: [40, 'Ancien n° de dossier'],
  nom: [80, 'Nom'],
  prenom: [80, 'Prénom'],
  quartier: [120, 'Quartier'],
  commune: [120, 'Commune'],
  profession: [120, 'Profession'],
  mere: [80, 'Prénom de la mère'],
  nomMere: [80, 'Nom de la mère'],
  urgenceNom: [160, 'Personne à prévenir'],
  urgenceLien: [60, 'Lien avec le patient'],
}

const propre = (v) =>
  String(v ?? '')
    .trim()
    .replace(/\s+/g, ' ')
const ouNull = (v) => propre(v) || null

// « 5/3/2024 » -> « 05/03/2024 » ; « 2024-03-05 » vérifiée (31/02 refusé).
function lireDate(texte) {
  const t = propre(texte)
  const fr = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (fr) return lireDateFr(`${fr[1].padStart(2, '0')}/${fr[2].padStart(2, '0')}/${fr[3]}`)
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (iso) return lireDateFr(`${iso[3]}/${iso[2]}/${iso[1]}`)
  return null
}

// « 3 », « 3 ans », « 8 mois » ; unité de la colonne dédiée sinon ; ans par défaut.
function lireAge(texteAge, texteUnite) {
  const m = normaliserEntete(texteAge).match(/^(\d{1,3}) ?(ans?|mois|m|a)?$/)
  if (!m) return null
  const unite = normaliserEntete(texteUnite)
  let enMois = m[2] === 'mois' || m[2] === 'm'
  if (!m[2] && ['mois', 'm'].includes(unite)) enMois = true
  if (!m[2] && unite && !['mois', 'm', 'ans', 'an', 'a'].includes(unite)) return { inconnue: true }
  return { age: Number(m[1]), unite: enMois ? 'mois' : 'ans' }
}

// « 77 123 45 67 », « 0022177… », « 221 77… », « +221 77… » -> « +221771234567 ».
export function versE164(texte, codePays) {
  let t = String(texte ?? '').replace(/[\s.\-()/]/g, '')
  if (!t) return null
  if (t.startsWith('00')) t = `+${t.slice(2)}`
  if (t.startsWith('+')) return /^\+\d+$/.test(t) ? t : 'invalide'
  if (!/^\d+$/.test(t)) return 'invalide'
  const pays = paysParCode(codePays) ?? paysParCode(PAYS_PAR_DEFAUT)
  if (
    t.startsWith(pays.indicatif) &&
    t.length === pays.indicatif.length + longueurNationale(pays)
  ) {
    return `+${t}`
  }
  return `+${pays.indicatif}${t}`
}

function telephone(texte, codePays, libelle, erreurs) {
  const e164 = versE164(texte, codePays)
  if (e164 && !estTelephoneValide(e164)) {
    erreurs.push(`${libelle} invalide : vérifiez le nombre de chiffres (un seul numéro).`)
    return null
  }
  return e164
}

function naissance(v, erreurs) {
  const aujourdhui = dayjs().tz(getFuseauHoraire()).format('YYYY-MM-DD')
  if (propre(v.naissance)) {
    const date = lireDate(v.naissance)
    if (!date) {
      erreurs.push(
        `Date de naissance illisible (« ${propre(v.naissance)} ») : JJ/MM/AAAA ou AAAA-MM-JJ.`,
      )
      return null
    }
    if (date > aujourdhui) {
      erreurs.push('La date de naissance ne peut pas être dans le futur.')
      return null
    }
    return naissanceVersBase({ type: 'date', date })
  }
  if (propre(v.age)) {
    const age = lireAge(v.age, v.uniteAge)
    if (!age) {
      erreurs.push(`Âge illisible (« ${propre(v.age)} ») : un nombre d’années, ou de mois.`)
      return null
    }
    if (age.inconnue) {
      erreurs.push('Unité de l’âge : « ans » ou « mois ».')
      return null
    }
    if ((age.unite === 'mois' ? age.age / 12 : age.age) > 130) {
      erreurs.push('Âge invalide : 130 ans au plus.')
      return null
    }
    return naissanceVersBase({ type: 'age', ...age })
  }
  erreurs.push('Indiquez la date de naissance ou l’âge déclaré.')
  return null
}

// { erreurs: [texte], patient: ligne pour import_patients, anneeNaissance }
export function validerLigne(valeurs, codePays) {
  const v = valeurs
  const erreurs = []

  if (!propre(v.nom)) erreurs.push('Nom manquant.')
  if (!propre(v.prenom)) erreurs.push('Prénom manquant.')
  for (const [cle, [max, libelle]] of Object.entries(LONGUEURS)) {
    if (propre(v[cle]).length > max)
      erreurs.push(`${libelle} trop long (${max} caractères au plus).`)
  }

  const sexeLu = normaliserEntete(v.sexe)
  const sexe = SEXES[sexeLu] ?? null
  if (!sexeLu) erreurs.push('Sexe manquant : F ou M.')
  else if (!sexe) erreurs.push(`Sexe illisible (« ${propre(v.sexe)} ») : F ou M.`)

  const base = naissance(v, erreurs)

  const phone = telephone(v.telephone, codePays, 'Téléphone', erreurs)
  const urgence = telephone(v.urgenceTel, codePays, 'Téléphone de la personne à prévenir', erreurs)

  const titulaireLu = normaliserEntete(v.titulaire)
  const titulaire = TITULAIRES[titulaireLu] ?? null
  if (phone && titulaireLu && !titulaire) {
    erreurs.push('Titulaire du téléphone : patient, mère, père, conjoint ou autre.')
  }

  const accordLu = normaliserEntete(v.consentement)
  let accord = null
  if (OUI.includes(accordLu)) accord = true
  else if (NON.includes(accordLu)) accord = false
  else if (phone && accordLu) erreurs.push('Accord WhatsApp : oui ou non (ou laissez vide).')

  if (erreurs.length) return { erreurs, patient: null, anneeNaissance: null }

  const anneeNaissance = base.birth_date
    ? Number(base.birth_date.slice(0, 4))
    : dayjs().tz(getFuseauHoraire()).year() - base.declared_age

  return {
    erreurs,
    anneeNaissance,
    patient: {
      legacy_file_number: ouNull(v.ancienNumero),
      last_name: propre(v.nom),
      first_name: propre(v.prenom),
      sex: sexe,
      birth_date: base.birth_date,
      birth_date_estimated: base.birth_date_estimated,
      declared_age: base.declared_age,
      phone,
      phone_owner: phone ? titulaire : null,
      whatsapp_consent: phone ? accord : null,
      neighborhood: ouNull(v.quartier),
      commune: ouNull(v.commune),
      occupation: ouNull(v.profession),
      mother_first_name: ouNull(v.mere),
      mother_last_name: ouNull(v.nomMere),
      emergency_contact_name: ouNull(v.urgenceNom),
      emergency_contact_phone: urgence,
      emergency_contact_relation: ouNull(v.urgenceLien),
    },
  }
}

// Clé de doublon dans le fichier : même nom complet, et même téléphone ou même année.
function cleInterne(p, annee) {
  const nom = normaliserEntete(`${p.last_name} ${p.first_name}`)
  return [
    `${nom}|${p.phone ?? ''}|${p.phone ? '' : annee}`,
    p.legacy_file_number ? `n|${normaliserEntete(p.legacy_file_number)}|${nom}` : null,
  ].filter(Boolean)
}

// Lignes lues -> lignes de l'aperçu :
// [{ numero, brut, valeurs, statut: 'valide' | 'erreur' | 'doublon', erreurs, patient,
//    anneeNaissance, ligneJumelle, candidats: [], importer: false }]
// Une ligne identique à une ligne précédente du fichier est un doublon probable.
export function preparerLignes(lignes, codePays) {
  const vues = new Map()
  return lignes.map((ligne) => {
    const { erreurs, patient, anneeNaissance } = validerLigne(ligne.valeurs, codePays)
    const resultat = {
      numero: ligne.numero,
      brut: ligne.brut,
      valeurs: ligne.valeurs,
      erreurs,
      patient,
      anneeNaissance,
      statut: erreurs.length ? 'erreur' : 'valide',
      ligneJumelle: null,
      candidats: [],
      importer: false,
    }
    if (patient) {
      const cles = cleInterne(patient, anneeNaissance)
      const jumelle = cles.map((c) => vues.get(c)).find(Boolean)
      if (jumelle) {
        resultat.statut = 'doublon'
        resultat.ligneJumelle = jumelle
      } else {
        for (const c of cles) vues.set(c, ligne.numero)
      }
    }
    return resultat
  })
}

// Critères envoyés à find_import_duplicates.
export function criteresDoublon(ligne) {
  return {
    line: ligne.numero,
    last_name: ligne.patient.last_name,
    first_name: ligne.patient.first_name,
    phone: ligne.patient.phone ?? '',
    mother_first_name: ligne.patient.mother_first_name ?? '',
    birth_year: ligne.anneeNaissance ?? '',
    legacy_file_number: ligne.patient.legacy_file_number ?? '',
  }
}
