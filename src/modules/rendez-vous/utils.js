import dayjs from 'dayjs'
// Plugins de fuseau et locale fr déclarés par format.js.
import '../../lib/format.js'

// Jours de la semaine ISO, comme en base (appointment_sessions.weekday : 1 = lundi).
export const JOURS_SEMAINE = [
  { valeur: 1, libelle: 'Lundi' },
  { valeur: 2, libelle: 'Mardi' },
  { valeur: 3, libelle: 'Mercredi' },
  { valeur: 4, libelle: 'Jeudi' },
  { valeur: 5, libelle: 'Vendredi' },
  { valeur: 6, libelle: 'Samedi' },
  { valeur: 7, libelle: 'Dimanche' },
]

export function libelleJour(iso) {
  return JOURS_SEMAINE.find((j) => j.valeur === Number(iso))?.libelle ?? ''
}

// Praticien : membre actif au rôle soignant, ou owner / admin qui exerce (is_clinician).
// Même règle que is_practitioner() en base (affichage seulement : la base décide).
const ROLES_SOIGNANTS = ['medecin', 'sage_femme', 'infirmier', 'aide_soignant']
export function estPraticien(membre) {
  return (
    membre.is_active &&
    (ROLES_SOIGNANTS.includes(membre.role) ||
      (['owner', 'admin'].includes(membre.role) && membre.is_clinician))
  )
}

// « 08:00:00 » (colonne time) -> « 08:00 ».
export function heureCourte(valeur) {
  return valeur ? String(valeur).slice(0, 5) : ''
}

// Date locale « 2026-10-23 » (sans fuseau) -> « 23/10/2026 ».
export function dateFr(iso) {
  if (!iso) return ''
  const [annee, mois, jour] = String(iso).slice(0, 10).split('-')
  return `${jour}/${mois}/${annee}`
}

// Date locale -> « vendredi 23 octobre 2026 ».
export function dateLongue(iso) {
  if (!iso) return ''
  return dayjs(String(iso).slice(0, 10)).format('dddd D MMMM YYYY')
}

// Valeur de <DateInput> pour une date locale « 2026-10-23 ».
export function versDateInput(iso) {
  return iso
    ? { type: 'date', date: iso, texte: dateFr(iso) }
    : { type: 'date', date: null, texte: '' }
}

// Nombre entier saisi : '' -> null ; illisible -> NaN (signalé sous la case).
export function lireEntier(texte) {
  const t = String(texte ?? '').trim()
  if (t === '') return null
  return /^\d+$/.test(t) ? Number(t) : Number.NaN
}

// « 15 min », « 1 h », « 1 h 30 ».
export function libelleDuree(minutes) {
  const m = Number(minutes)
  if (!Number.isFinite(m) || m <= 0) return ''
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const reste = m % 60
  return reste ? `${h} h ${String(reste).padStart(2, '0')}` : `${h} h`
}
