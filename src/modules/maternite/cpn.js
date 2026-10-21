// CPN (sans affichage) : brouillon de la section CPN de la consultation (clé « maternite »
// du brouillon, recopiée par la base à la validation), contrôles avant validation (mêmes
// bornes que anc_visit_from_encounter), libellés du tableau et du bilan. La base fait foi.

import { formatDate } from '../../lib/format.js'
import { lireNombre } from '../consultations/utils.js'
import { ajouterJours, formatSA } from './grossesse.js'

export const LISTES_CPN = [
  { code: 'presentation', libelle: 'Présentation', cle: 'presentation_option_id' },
  { code: 'oedema', libelle: 'Œdèmes', cle: 'oedema_option_id' },
  { code: 'proteinuria', libelle: 'Protéinurie', cle: 'proteinuria_option_id' },
  { code: 'glycosuria', libelle: 'Glycosurie', cle: 'glycosuria_option_id' },
]

export const CPN_VIDE = {
  fundal_height_cm: '',
  // null : non recherchés ; false : non perçus ; true : perçus.
  fetal_heart_heard: null,
  fetal_heart_rate: '',
  presentation_option_id: '',
  oedema_option_id: '',
  proteinuria_option_id: '',
  glycosuria_option_id: '',
  note: '',
}

export const BCF = [
  { valeur: 'non_recherches', libelle: 'Non recherchés', heard: null },
  { valeur: 'non_percus', libelle: 'Non perçus', heard: false },
  { valeur: 'percus', libelle: 'Perçus', heard: true },
]

export const valeurBcf = (heard) => BCF.find((b) => b.heard === (heard ?? null))?.valeur

export const HAUTEUR = { min: 5, max: 50 }
export const FREQUENCE = { min: 60, max: 220 }
export const NOTE_MAX = 500

export function normaliserCpn(m) {
  return { ...CPN_VIDE, ...(m && typeof m === 'object' ? m : {}) }
}

// Erreurs sous les cases : { fundal_height_cm?, fetal_heart_rate?, note? }.
export function verifierCpn(m) {
  const c = normaliserCpn(m)
  const erreurs = {}
  const hauteur = lireNombre(c.fundal_height_cm)
  if (Number.isNaN(hauteur)) erreurs.fundal_height_cm = 'Tapez un nombre, par exemple 26.'
  else if (hauteur !== null && (hauteur < HAUTEUR.min || hauteur > HAUTEUR.max)) {
    erreurs.fundal_height_cm = `Hauteur utérine : de ${HAUTEUR.min} à ${HAUTEUR.max} cm.`
  }
  const frequence = lireNombre(c.fetal_heart_rate)
  if (Number.isNaN(frequence) || (frequence !== null && !Number.isInteger(frequence))) {
    erreurs.fetal_heart_rate = 'Tapez un nombre entier, par exemple 140.'
  } else if (frequence !== null && (frequence < FREQUENCE.min || frequence > FREQUENCE.max)) {
    erreurs.fetal_heart_rate = `Fréquence : de ${FREQUENCE.min} à ${FREQUENCE.max} battements par minute.`
  } else if (frequence !== null && c.fetal_heart_heard !== true) {
    erreurs.fetal_heart_rate = 'Cochez « Perçus » pour noter la fréquence.'
  }
  if ((c.note ?? '').trim().length > NOTE_MAX) erreurs.note = `${NOTE_MAX} caractères au plus.`
  return erreurs
}

// Refus de la base rangé sous sa case, ou null.
export function caseCpnDuMessage(message) {
  const m = String(message || '')
  if (/^Hauteur utérine/.test(m)) return 'fundal_height_cm'
  if (/^Bruits du cœur/.test(m)) return 'fetal_heart_rate'
  if (/^Remarque de la CPN/.test(m)) return 'note'
  const liste = LISTES_CPN.find((l) => m.startsWith(l.libelle))
  return liste ? liste.cle : null
}

// --- Libellés -----------------------------------------------------------------------------

const nombre = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 })
const present = (v) => v !== null && v !== undefined && v !== ''

export const formatPoids = (kg) => (present(kg) ? `${nombre.format(Number(kg))} kg` : '—')
export const formatHauteur = (cm) => (present(cm) ? `${nombre.format(Number(cm))} cm` : '—')
export const formatTension = (s, d) => (present(s) && present(d) ? `${s}/${d}` : '—')

export function libelleBcf(heard, rate) {
  if (heard === true) return present(rate) ? `Perçus · ${rate}/min` : 'Perçus'
  if (heard === false) return 'Non perçus'
  return '—'
}

// « 2 CPN faites · 1 manquée » (modèle à part).
export function resumeBilan(b) {
  if (!b) return ''
  const faites = `${b.done} CPN faite${b.done > 1 ? 's' : ''}`
  if (b.missed === null || b.missed === undefined) return faites
  return b.missed > 0
    ? `${faites} · ${b.missed} manquée${b.missed > 1 ? 's' : ''}`
    : `${faites} · aucune manquée`
}

// « CPN 3 attendue vers le 12/11/2026 (32 SA), entre le 05/11/2026 et le 03/12/2026. »
export function texteProchaine(next) {
  if (!next) return null
  return (
    `CPN ${next.anc_number} attendue vers le ${formatDate(next.target_date)} ` +
    `(${formatSA(next.target_ga_days)}), entre le ${formatDate(next.window_start_date)} ` +
    `et le ${formatDate(next.window_end_date)}.`
  )
}

// Prochaine CPN attendue si la CPN en cours de saisie (brouillon, pas encore comptée par la
// base) est validée aujourd'hui : même règle que anc_status_compute, avec une CPN de plus.
//   status : anc_status ; contacts : contacts du modèle de la grossesse ; gaJours : terme
//   du jour ; aujourdhui : AAAA-MM-JJ. Renvoie la forme de status.next, ou null.
export function prochaineApresBrouillon(status, contacts, gaJours, aujourdhui) {
  if (!status || status.ga_days === null || status.ga_days === undefined) return null
  const faites = status.done + 1
  const c = [...(contacts ?? [])]
    .sort((a, b) => a.contact_number - b.contact_number)
    .find((x) => x.contact_number > faites && x.window_end_days >= gaJours)
  if (!c) return null
  const date = (jours) => ajouterJours(aujourdhui, jours - gaJours)
  const cible = date(c.target_ga_days)
  return {
    contact_number: c.contact_number,
    anc_number: faites + 1,
    target_ga_days: c.target_ga_days,
    target_date: cible > aujourdhui ? cible : aujourdhui,
    window_start_date: date(c.window_start_days),
    window_end_date: date(c.window_end_days),
  }
}

// Prochaine CPN d'une consultation (réponse de get_encounter_anc) : celle de la base si la
// CPN est validée, sinon calculée en comptant la CPN du brouillon.
export function prochaineCpn(cpn, modeles, aujourdhui) {
  if (!cpn?.pregnancy || !cpn.status) return null
  if (cpn.visit) return cpn.status.next ?? null
  const modele = (modeles ?? []).find((m) => m.code === cpn.status.model_code)
  if (!modele) return null
  return prochaineApresBrouillon(cpn.status, modele.contacts, cpn.status.ga_days, aujourdhui)
}

// « 12, 26, 32 et 36 SA » : cibles d'un modèle.
export function ciblesModele(contacts) {
  const sa = (contacts ?? []).map((c) => Math.round(c.target_ga_days / 7))
  if (sa.length < 2) return sa.length ? `${sa[0]} SA` : ''
  return `${sa.slice(0, -1).join(', ')} et ${sa.at(-1)} SA`
}
