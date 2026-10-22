// Soins de la CPN (sans affichage) : brouillon (clé « maternite » de la consultation :
// conditions, condition_end_reasons, interventions, counselling, td, external_tests, recopiés
// par la base à la validation), dates approximatives des vaccins, ligne d'ordonnance
// proposée par « Ajouter à l'ordonnance ». La base fait foi (règles, blocages, rangs).

import { formatDate } from '../../lib/format.js'
import { formatDose, majLigne, nouvelleLigne } from '../consultations/ordonnance.js'

const MOIS = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
]

export const PRECISIONS = [
  { valeur: 'day', libelle: 'Jour connu' },
  { valeur: 'month', libelle: 'Mois seulement' },
  { valeur: 'year', libelle: 'Année seulement' },
]

export const MOIS_OPTIONS = MOIS.map((m, i) => ({
  valeur: String(i + 1).padStart(2, '0'),
  libelle: m,
}))

// Date à sa précision : « 17/03/2024 », « mars 2024 », « 2025 » (jamais un jour inventé).
export function formatDateApprox(iso, precision = 'day') {
  if (!iso) return '—'
  const [a, m] = String(iso).slice(0, 10).split('-')
  if (precision === 'year') return a
  if (precision === 'month') return `${MOIS[Number(m) - 1]} ${a}`
  return formatDate(iso)
}

// « à partir du 02/07/2025 », ou « à partir de juillet 2025 » si la date vient d'une dose
// datée au mois ou à l'année (lecture prudente : premier jour possible).
export function formatAPartirDe(iso, precision = 'day') {
  if (!iso) return ''
  if (!precision || precision === 'day') return `à partir du ${formatDate(iso)}`
  const [a, m] = String(iso).slice(0, 10).split('-')
  return `à partir de ${MOIS[Number(m) - 1]} ${a}`
}

// Date d'une dose d'après le carnet : jour exact, mois ou année → AAAA-MM-JJ, ou null.
export function dateCarnet(precision, jour, mois, annee) {
  if (precision === 'day') return jour || null
  if (!/^\d{4}$/.test(annee ?? '')) return null
  if (precision === 'year') return `${annee}-01-01`
  return mois ? `${annee}-${mois}-01` : null
}

// Protection du Td d'après la dose de plus haut rang (rien sans dose : la liste le dit).
export function texteProtection(p) {
  if (!p) return ''
  if (p.kind === 'lifetime') return 'Protégée à vie.'
  if (p.kind === 'none') return 'Pas encore protégée.'
  const jusque = formatDateApprox(p.until, p.precision)
  // Date approximative : fin de protection lue au plus tôt (« au moins jusqu'à début 2028 »).
  return p.precision && p.precision !== 'day'
    ? `Protégée au moins jusqu’à début ${jusque}.`
    : `Protégée jusqu’au ${jusque}.`
}

// « Td 2 possible dès aujourd'hui » si la date est passée (ou sans délai) ; sinon
// « Prochaine : Td 2, à partir du 02/07/2025 » (à sa précision : « de juillet 2025 »).
export function texteProchaineDose(next, aujourdhui) {
  if (!next) return null
  if (!next.possible_from || next.possible_from <= aujourdhui) {
    return `${next.label} possible dès aujourd’hui.`
  }
  return `Prochaine : ${next.label}, ${formatAPartirDe(next.possible_from, next.precision)}.`
}

// « SP 2 », « Fer et acide folique ».
export const libelleSoin = (s) =>
  s.dose_label && s.dose_number ? `${s.dose_label} ${s.dose_number}` : s.label

// État d'un type de soin pour la CPN du jour (brouillon) :
//   { faisable, raison } ; raison : texte affiché quand le soin ne peut pas être coché.
export function etatSoin(soin, aujourdhui) {
  if (soin.blocked) return { faisable: false, raison: soin.block_message }
  if (soin.complete) return { faisable: false, raison: 'Déjà noté pour cette grossesse.' }
  if (soin.possible_from && soin.possible_from > aujourdhui) {
    return { faisable: false, raison: `Possible ${formatAPartirDe(soin.possible_from)}.` }
  }
  return { faisable: true, raison: null }
}

// --- Brouillon --------------------------------------------------------------------------

export const SOINS_VIDE = {
  interventions: [],
  counselling: [],
  external_tests: [],
  td: null,
}

export function normaliserSoins(m) {
  const v = m && typeof m === 'object' ? m : {}
  return {
    ...v,
    interventions: Array.isArray(v.interventions) ? v.interventions : [],
    counselling: Array.isArray(v.counselling) ? v.counselling : [],
    external_tests: Array.isArray(v.external_tests) ? v.external_tests : [],
    td: v.td && typeof v.td === 'object' ? v.td : null,
  }
}

// Situations cochées : celles du brouillon si l'écran les a touchées, sinon celles en
// cours d'après la grossesse.
export function situationsCochees(m, situations) {
  if (Array.isArray(m?.conditions)) return m.conditions
  return (situations ?? []).filter((s) => s.active).map((s) => s.code)
}

// CPN rendue sensible d'office par ses soins : situation cochée (toutes sensibles
// aujourd'hui) ou résultat extérieur d'un examen sensible. La base le refait.
export function soinsSensibles(m, examens) {
  const v = normaliserSoins(m)
  return (
    (Array.isArray(v.conditions) && v.conditions.length > 0) ||
    v.external_tests.some((t) => examens?.find((e) => e.id === t.rapid_test_type_id)?.is_sensitive)
  )
}

// Erreurs sous les cases : { fin: { code: message }, externes: { index: message } }.
export function verifierSoins(m, situations) {
  const v = normaliserSoins(m)
  const erreurs = {}
  if (Array.isArray(v.conditions)) {
    for (const s of situations ?? []) {
      const motif = (v.condition_end_reasons?.[s.code] ?? '').trim()
      if (s.active && !v.conditions.includes(s.code) && motif.length < 3) {
        erreurs.fin = {
          ...erreurs.fin,
          [s.code]: `Indiquez pourquoi « ${s.label} » est décoché.`,
        }
      }
    }
  }
  v.external_tests.forEach((t, i) => {
    let message = null
    if (!t.rapid_test_type_id) message = 'Choisissez l’examen.'
    else if (!t.taken_on) message = 'Indiquez la date de l’examen (JJ/MM/AAAA).'
    else if ((t.lab_name ?? '').trim().length < 2) message = 'Indiquez le laboratoire.'
    else if (!t.result && !String(t.value_number ?? '').trim() && !(t.value_text ?? '').trim())
      message = 'Indiquez le résultat.'
    if (message) erreurs.externes = { ...erreurs.externes, [i]: message }
  })
  return erreurs
}

// --- Ordonnance -------------------------------------------------------------------------

// Clé fixe par type de soin : un second clic, ou un brouillon rejoué après une coupure, ne
// crée jamais de doublon.
export const cleOrdonnanceSoin = (soin) => `maternite-${soin.code ?? soin.type_id}`

export const dansOrdonnance = (ordonnance, soin) =>
  (ordonnance?.items ?? []).some((l) => l.cle === cleOrdonnanceSoin(soin))

// Nom de produit comparable, comme drug_name_normalize : minuscules, sans accents,
// apostrophes, tirets, « + » ni ponctuation.
const normaliserNom = (t) =>
  String(t ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’`]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

// Lignes de l'ordonnance qui correspondent à un soin bloqué par une situation cochée (SP
// sous cotrimoxazole) : clé fixe de « Ajouter à l'ordonnance », ou même nom de produit que
// la ligne proposée par le type. La base fait le même contrôle à la validation.
//   types : maternal_intervention_types ; cochees : codes des situations cochées.
//   Renvoie { [cle de la ligne]: message }.
export function lignesBloquees(ordonnance, types, cochees) {
  const bloques = (types ?? []).filter(
    (t) => t.blocked_by_condition && (cochees ?? []).includes(t.blocked_by_condition),
  )
  const resultat = {}
  for (const l of ordonnance?.items ?? []) {
    const t = bloques.find(
      (x) =>
        l.cle === cleOrdonnanceSoin({ code: x.template_code, type_id: x.id }) ||
        (x.prescription?.product_name &&
          normaliserNom(x.prescription.product_name) === normaliserNom(l.product_name)),
    )
    if (t) resultat[l.cle] = `${t.block_message} Retirez cette ligne de l’ordonnance.`
  }
  return resultat
}

// Ordonnance avec la ligne du soin (posologie de son type), ou la même si elle y est déjà.
// L'ordonnance reste sans diagnostic : seulement le médicament et sa posologie.
export function ajouterSoinOrdonnance(ordonnance, soin, formes = []) {
  if (!soin.prescription || dansOrdonnance(ordonnance, soin)) return ordonnance
  const p = soin.prescription
  const dose = (n) => (n === null || n === undefined ? '' : formatDose(Number(n)))
  const base = { ...nouvelleLigne(), cle: cleOrdonnanceSoin(soin) }
  let ligne = majLigne(
    base,
    {
      product_name: p.product_name ?? '',
      dosage: p.dosage ?? '',
      form_code: p.form_code ?? '',
      route_code: p.route_code ?? '',
      instructions: p.instructions ?? '',
      saisies: {
        matin: dose(p.dose_morning),
        midi: dose(p.dose_noon),
        soir: dose(p.dose_evening),
        nuit: dose(p.dose_night),
        duree: p.duration_days ? String(p.duration_days) : '',
      },
    },
    formes,
  )
  // Quantité du type seulement si le calcul ne la donne pas (sinon la ligne paraîtrait
  // « modifiée à la main »).
  if (p.quantity && ligne.quantity !== Number(p.quantity)) {
    ligne = majLigne(ligne, { saisies: { quantite: String(p.quantity) } }, formes)
  }
  return { ...ordonnance, items: [...(ordonnance?.items ?? []), ligne] }
}
