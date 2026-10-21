// Grossesse : datation, date prévue d'accouchement (DPA) et âge gestationnel.
// Copie fidèle des calculs de la base (pregnancy_edd, pregnancy_dating_compute), pour
// l'affichage pendant la saisie seulement : la base recalcule et fait foi. Les réglages
// (méthode, durée, âge gestationnel maximal) viennent de maternity_settings, jamais d'ici.

import { dayjs, getFuseauHoraire } from '../../lib/format.js'

export const DATATIONS = [
  { valeur: 'lmp', libelle: 'Date des dernières règles (DDR)' },
  { valeur: 'ultrasound', libelle: 'Échographie' },
  { valeur: 'clinical', libelle: 'Estimation clinique' },
]

export const LIBELLES_DATATION = {
  lmp: 'DDR',
  ultrasound: 'Échographie',
  clinical: 'Estimation clinique',
}

export const METHODES_DPA = [
  {
    valeur: 'naegele',
    libelle: 'Règle de Naegele',
    description: 'DDR + 7 jours − 3 mois + 1 an.',
  },
  {
    valeur: 'plus_days',
    libelle: 'DDR + durée de la grossesse',
    description: 'DDR + le nombre de jours réglé ci-dessous (280 jours proposés).',
  },
]

export function aujourdhuiStructure() {
  return dayjs().tz(getFuseauHoraire()).format('YYYY-MM-DD')
}

// Différence en jours entre deux dates « AAAA-MM-JJ » (b - a), sans fuseau ni heure d'été.
export function joursEntre(a, b) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000)
}

export function ajouterJours(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

// DPA depuis la DDR. Naegele dans cet ordre : + 7 jours, - 3 mois, + 1 an ; dayjs ramène un
// jour inexistant (31 septembre) au dernier jour du mois, comme la base.
// Contrôle : DDR 2026-03-01 -> 2026-12-08 (Naegele) ; 2026-12-06 (DDR + 280 jours).
export function dpaDepuisDdr(ddr, methode, dureeJours) {
  if (methode === 'naegele') {
    return dayjs(ddr).add(7, 'day').subtract(3, 'month').add(1, 'year').format('YYYY-MM-DD')
  }
  if (methode === 'plus_days') return ajouterJours(ddr, dureeJours)
  return null
}

// « 24 SA + 3 j » ; « 10 SA » pile.
export function formatSA(jours) {
  if (jours === null || jours === undefined || !Number.isFinite(jours) || jours < 0) return ''
  const semaines = Math.floor(jours / 7)
  const reste = jours % 7
  return reste ? `${semaines} SA + ${reste} j` : `${semaines} SA`
}

// --- Saisie d'une datation ---------------------------------------------------

export const DATATION_VIDE = {
  type: 'lmp',
  ddr: '',
  examen: '',
  // Échographie : 'age' (âge gestationnel lu) ou 'dpa' (DPA lue sur le compte rendu).
  lecture: 'age',
  semaines: '',
  jours: '',
  dpa: '',
}

// Âge gestationnel saisi en semaines + jours ; null si vide, NaN si incompris.
function joursSaisis(s) {
  if (s.semaines === '' && s.jours === '') return null
  const semaines = s.semaines === '' ? 0 : Number(s.semaines)
  const jours = s.jours === '' ? 0 : Number(s.jours)
  if (!Number.isInteger(semaines) || !Number.isInteger(jours) || jours > 6) return Number.NaN
  return semaines * 7 + jours
}

// Contrôle de la saisie avec les mêmes règles que la base.
// Renvoie { erreurs, valeur (paramètres de la base), apercu ({ dpa, ageJours } ou null) }.
// lireDate : texte JJ/MM/AAAA -> AAAA-MM-JJ ou null.
export function verifierDatation(s, reglages, lireDate, aujourdhui = aujourdhuiStructure()) {
  const erreurs = {}
  const max = reglages?.max_gestational_days
  const duree = reglages?.pregnancy_length_days
  let reference = null
  let dpa = null
  const valeur = { kind: s.type, lmp: null, exam: null, gaDays: null, edd: null }

  if (s.type === 'lmp') {
    const ddr = lireDate(s.ddr)
    if (!s.ddr) erreurs.ddr = 'Indiquez la date des dernières règles.'
    else if (!ddr) erreurs.ddr = 'Date incomplète ou inexistante : JJ/MM/AAAA.'
    else if (ddr > aujourdhui)
      erreurs.ddr = 'La date des dernières règles ne peut pas être dans le futur.'
    else {
      valeur.lmp = ddr
      reference = ddr
      dpa = reglages ? dpaDepuisDdr(ddr, reglages.edd_method, duree) : null
    }
  } else {
    const examen = lireDate(s.examen)
    if (!s.examen) erreurs.examen = 'Indiquez la date de l’examen.'
    else if (!examen) erreurs.examen = 'Date incomplète ou inexistante : JJ/MM/AAAA.'
    else if (examen > aujourdhui)
      erreurs.examen = 'La date de l’examen ne peut pas être dans le futur.'
    else valeur.exam = examen

    if (s.type === 'ultrasound' && s.lecture === 'dpa') {
      const lue = lireDate(s.dpa)
      if (!s.dpa) erreurs.dpa = 'Indiquez la date prévue lue sur le compte rendu.'
      else if (!lue) erreurs.dpa = 'Date incomplète ou inexistante : JJ/MM/AAAA.'
      else {
        valeur.edd = lue
        if (valeur.exam && duree) {
          reference = ajouterJours(lue, -duree)
          dpa = lue
          const age = joursEntre(reference, valeur.exam)
          if (age < 0 || (max && age > max)) {
            erreurs.dpa =
              'Cette date prévue ne correspond pas à la date de l’examen : vérifiez les deux dates.'
          }
        }
      }
    } else {
      const age = joursSaisis(s)
      if (age === null) erreurs.semaines = 'Indiquez l’âge gestationnel à l’examen.'
      else if (Number.isNaN(age)) erreurs.semaines = 'Semaines en nombre entier, jours de 0 à 6.'
      else if (max && age > max) {
        erreurs.semaines = `Âge gestationnel à l’examen : entre 0 et ${Math.floor(max / 7)} SA.`
      } else {
        valeur.gaDays = age
        if (valeur.exam && duree) {
          reference = ajouterJours(valeur.exam, -age)
          dpa = ajouterJours(reference, duree)
        }
      }
    }
  }

  const ageJours = reference ? joursEntre(reference, aujourdhui) : null
  if (ageJours !== null && max && ageJours > max && !Object.keys(erreurs).length) {
    const champ = s.type === 'lmp' ? 'ddr' : 'examen'
    erreurs[champ] =
      `D’après cette datation, la grossesse aurait ${Math.floor(ageJours / 7)} SA aujourd’hui : vérifiez la date.`
  }
  return { erreurs, valeur, apercu: dpa ? { dpa, ageJours } : null }
}

// --- Gestité, parité, enfants vivants ----------------------------------------

export function verifierObstetrique(s) {
  const erreurs = {}
  const g = s.gestite === '' ? null : Number(s.gestite)
  const p = s.parite === '' ? null : Number(s.parite)
  const ev = s.vivants === '' ? null : Number(s.vivants)
  if (g === null) erreurs.gestite = 'Indiquez le nombre de grossesses, celle-ci comprise.'
  else if (!Number.isInteger(g) || g < 1 || g > 30) erreurs.gestite = 'De 1 à 30.'
  if (p === null)
    erreurs.parite = 'Indiquez le nombre d’accouchements avant cette grossesse (0 si aucun).'
  else if (!Number.isInteger(p) || p < 0) erreurs.parite = 'Un nombre entier, 0 si aucun.'
  else if (g !== null && Number.isInteger(g) && p >= g) {
    erreurs.parite = `Au plus ${Math.max(g - 1, 0)} : la parité compte les accouchements avant cette grossesse.`
  }
  if (ev === null) erreurs.vivants = 'Indiquez le nombre d’enfants vivants (0 si aucun).'
  else if (!Number.isInteger(ev) || ev < 0 || ev > 30) erreurs.vivants = 'De 0 à 30.'
  return { erreurs, valeur: { gravidity: g, parity: p, living: ev } }
}

// « G3 P2 EV2 », comme sur le carnet.
export function formatGPE(g) {
  if (!g) return ''
  return `G${g.gravidity} P${g.parity} EV${g.living_children}`
}
