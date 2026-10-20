import { formatIlYa } from '../../lib/format.js'
import { normaliserOrdonnance, ORDONNANCE_VIDE, verifierOrdonnance } from './ordonnance.js'

// Consultation (sans affichage) : contenu du brouillon, contrôles avant validation,
// libellés. Le brouillon a la forme attendue par validate_encounter (étape 14, partie A) ;
// les champs en plus (libellé du type, drapeaux du catalogue) servent à l'écran seulement.

// Retour depuis une consultation : la page d'où l'on vient (state.retour, posé par le lien
// qui l'a ouverte, gardé par le navigateur au rechargement), sinon la file d'attente pour
// un passage et la fiche du patient pour une consultation ouverte hors passage.
const RETOURS = [
  [/^\/app\/file-attente(\?|$)/, 'File d’attente'],
  [/^\/app\/consultations(\?|$)/, 'Consultations'],
  [/^\/app\/patients\/[^/?]+(\?|$)/, 'Fiche du patient'],
  [/^\/app\/?(\?|$)/, 'Journée du jour'],
]

export function retourConsultation(consultation, depuis) {
  const connu = typeof depuis === 'string' && RETOURS.find(([motif]) => motif.test(depuis))
  if (connu) return { to: depuis, libelle: connu[1] }
  return consultation.visit_id
    ? { to: '/app/file-attente', libelle: 'File d’attente' }
    : { to: `/app/patients/${consultation.patient_id}`, libelle: 'Fiche du patient' }
}

// État de navigation à passer au lien qui ouvre une consultation.
export const etatRetour = (location) => ({ retour: location.pathname + location.search })

export const LIMITES = { reason: 500, history: 4000, examination: 4000, plan: 4000 }
export const DIAGNOSTICS_MAX = 10
export const EXAMENS_MAX = 20

export const BROUILLON_VIDE = {
  encounter_type_id: null,
  reason: '',
  history: '',
  examination: '',
  plan: '',
  is_sensitive: false,
  diagnoses: [],
  tests: [],
  prescription: ORDONNANCE_VIDE,
}

// Brouillon venu du serveur ou de l'appareil, complété des champs manquants.
export function normaliser(contenu) {
  const c = contenu && typeof contenu === 'object' ? contenu : {}
  return {
    ...BROUILLON_VIDE,
    ...c,
    diagnoses: Array.isArray(c.diagnoses) ? c.diagnoses : [],
    tests: Array.isArray(c.tests) ? c.tests : [],
    prescription: normaliserOrdonnance(c.prescription),
  }
}

export const memeContenu = (a, b) => JSON.stringify(a) === JSON.stringify(b)

// --- Diagnostics -------------------------------------------------------------------------

// Diagnostic choisi dans le catalogue : le premier devient principal.
export function ajouterDiagnostic(liste, d) {
  if (d.catalog_id && liste.some((x) => x.catalog_id === d.catalog_id)) return liste
  const rang = liste.some((x) => x.rank === 'primary') ? 'secondary' : 'primary'
  return [...liste, { ...d, rank: rang }]
}

// Retrait : si le principal part, le suivant le devient.
export function retirerDiagnostic(liste, index) {
  const reste = liste.filter((_, i) => i !== index)
  if (reste.length && !reste.some((x) => x.rank === 'primary')) {
    reste[0] = { ...reste[0], rank: 'primary' }
  }
  return reste
}

// Un seul principal : choisir l'un fait passer les autres en secondaire.
export function rendrePrincipal(liste, index) {
  return liste.map((x, i) => ({ ...x, rank: i === index ? 'primary' : 'secondary' }))
}

export function diagnosticDepuisCatalogue(r) {
  return {
    catalog_id: r.id,
    code: r.code ?? null,
    label: r.label,
    is_notifiable: Boolean(r.is_notifiable),
    notification_delay: r.notification_delay ?? null,
    is_sensitive: Boolean(r.is_sensitive),
  }
}

// Diagnostics à déclaration immédiate du brouillon (bandeau « Validez la consultation »).
export function declarationsImmediates(contenu) {
  return (contenu.diagnoses ?? [])
    .filter((d) => d.notification_delay === 'immediate')
    .map((d) => d.label)
}

export function libelleDeclaration(delai) {
  if (delai === 'immediate') return 'Déclaration immédiate'
  if (delai === 'weekly') return 'Déclaration hebdomadaire'
  return null
}

// --- Examens rapides ---------------------------------------------------------------------

export const RESULTATS = [
  { valeur: 'positive', libelle: 'Positif' },
  { valeur: 'negative', libelle: 'Négatif' },
  { valeur: 'invalid', libelle: 'Invalide' },
]

export const libelleResultat = (r) => RESULTATS.find((x) => x.valeur === r)?.libelle ?? ''

// « Positif », « 1,05 g/L », « Leucocytes ++ ».
export function resumeExamen(t) {
  if (t.result_kind === 'binary') return libelleResultat(t.result)
  if (t.result_kind === 'number' && t.value_number !== null && t.value_number !== undefined) {
    const valeur = new Intl.NumberFormat('fr-FR').format(t.value_number)
    return t.unit ? `${valeur} ${t.unit}` : valeur
  }
  return t.value_text ?? ''
}

// Valeur numérique saisie (virgule acceptée) : nombre, null si vide, NaN si illisible.
export function lireNombre(texte) {
  const t = String(texte ?? '')
    .trim()
    .replace(/\s/g, '')
    .replace(',', '.')
  if (!t) return null
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : Number.NaN
}

// --- Contrôles avant validation ----------------------------------------------------------

// Mêmes règles que validate_encounter, pour afficher chaque erreur sous sa case avant
// l'envoi. La base reste juge : ses refus s'affichent aussi.
//   types d'examens : [{ id, label, result_kind }]
export function verifier(contenu, examens = []) {
  const erreurs = {}
  if (!contenu.reason?.trim()) erreurs.reason = 'Indiquez le motif de la consultation.'
  for (const champ of ['reason', 'history', 'examination', 'plan']) {
    if ((contenu[champ] ?? '').trim().length > LIMITES[champ]) {
      erreurs[champ] = `${LIMITES[champ]} caractères au plus.`
    }
  }
  const principaux = contenu.diagnoses.filter((d) => d.rank === 'primary').length
  if (contenu.diagnoses.length && principaux !== 1) {
    erreurs.diagnoses = 'Choisissez un seul diagnostic principal.'
  }
  const examensErreurs = {}
  contenu.tests.forEach((t, i) => {
    const type = examens.find((e) => e.id === t.rapid_test_type_id)
    if (!type) examensErreurs[i] = 'Choisissez l’examen.'
    else if (type.result_kind === 'binary' && !t.result)
      examensErreurs[i] = 'Choisissez le résultat.'
    else if (type.result_kind === 'number') {
      const n = lireNombre(t.value)
      if (n === null) examensErreurs[i] = 'Saisissez le résultat.'
      else if (Number.isNaN(n)) examensErreurs[i] = 'Tapez un nombre, par exemple 1,05.'
    } else if (type.result_kind === 'text' && !String(t.value ?? '').trim()) {
      examensErreurs[i] = 'Saisissez le résultat.'
    }
  })
  if (Object.keys(examensErreurs).length) erreurs.tests = examensErreurs
  const ordonnance = verifierOrdonnance(contenu.prescription)
  if (Object.keys(ordonnance).length) erreurs.prescription = ordonnance
  return erreurs
}

// --- Heures ------------------------------------------------------------------------------

// « il y a 20 secondes » sous la minute (reprise d'un brouillon), puis formatIlYa.
export function ilYa(date, maintenant = new Date()) {
  if (!date) return ''
  const secondes = Math.floor((maintenant.getTime() - new Date(date).getTime()) / 1000)
  if (secondes < 5) return 'à l’instant'
  if (secondes < 60) return `il y a ${secondes} secondes`
  return formatIlYa(date, maintenant)
}

// Brouillon local : clé du formulaire (utilisateur et structure ajoutés par cleBrouillon).
export const cleLocale = (id) => `consultation.${id}`
