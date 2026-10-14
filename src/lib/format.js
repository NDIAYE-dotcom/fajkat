import dayjs from 'dayjs'
import 'dayjs/locale/fr'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'
import { decouperE164, grouperChiffres, longueurNationale } from './pays.js'

dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.locale('fr')

export const FUSEAU_PAR_DEFAUT = 'Africa/Dakar'

let fuseauCourant = FUSEAU_PAR_DEFAUT
dayjs.tz.setDefault(fuseauCourant)

// Appelé au chargement de la structure active : chaque structure a son propre fuseau.
export function setFuseauHoraire(fuseau) {
  fuseauCourant = fuseau || FUSEAU_PAR_DEFAUT
  dayjs.tz.setDefault(fuseauCourant)
}

export function getFuseauHoraire() {
  return fuseauCourant
}

// Les dates sont stockées en UTC (timestamptz) et affichées dans le fuseau de la structure.
function versFuseau(date) {
  if (date === null || date === undefined || date === '') return null
  const d = dayjs(date)
  return d.isValid() ? d.tz(fuseauCourant) : null
}

const nombreFr = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })

// « 12500 » -> « 12 500 » (espace insécable fine), sans unité : champs de saisie, tableaux.
export function formatNombre(nombre) {
  if (nombre === null || nombre === undefined || nombre === '') return ''
  const valeur = Number(nombre)
  return Number.isFinite(valeur) ? nombreFr.format(Math.round(valeur)) : ''
}

// Montants en FCFA entiers : 12500 -> « 12 500 FCFA » (espace insécable).
export function formatFCFA(montant) {
  if (montant === null || montant === undefined || montant === '') return ''
  const valeur = Number(montant)
  if (!Number.isFinite(valeur)) return ''
  return `${nombreFr.format(Math.round(valeur))}\u00A0FCFA`
}

// « 13/10/2026 »
export function formatDate(date) {
  const d = versFuseau(date)
  return d ? d.format('DD/MM/YYYY') : ''
}

// « 13/10/2026 14:30 »
export function formatDateHeure(date) {
  const d = versFuseau(date)
  return d ? d.format('DD/MM/YYYY HH:mm') : ''
}

// « +221771234567 » -> « +221 77 123 45 67 ». Numéro non reconnu : renvoyé tel quel.
export function formatTelephone(e164) {
  if (!e164) return ''
  const brut = String(e164).replace(/[^\d+]/g, '')
  const parties = decouperE164(brut)
  if (!parties) return String(e164)
  const { pays, national } = parties
  if (national.length !== longueurNationale(pays)) return `+${pays.indicatif} ${national}`
  return `+${pays.indicatif} ${grouperChiffres(national, pays.groupes)}`
}

// Saisie « 12051990 » -> « 12/05/1990 » : les barres s'ajoutent pendant la frappe.
export function masquerDate(chiffres) {
  const c = String(chiffres).replace(/\D/g, '').slice(0, 8)
  return [c.slice(0, 2), c.slice(2, 4), c.slice(4)].filter(Boolean).join('/')
}

// « 12/05/1990 » -> « 1990-05-12 » ; null si la date est incomplète ou n'existe pas (31/02).
export function lireDateFr(texte) {
  const match = String(texte || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!match) return null
  const [, jour, mois, annee] = match.map(Number)
  const date = new Date(Date.UTC(annee, mois - 1, jour))
  const existe =
    date.getUTCFullYear() === annee && date.getUTCMonth() === mois - 1 && date.getUTCDate() === jour
  return existe && annee >= 1900 ? `${match[3]}-${match[2]}-${match[1]}` : null
}

// Âge à partir de la date de naissance : « 3 ans », « 8 mois », « 12 jours ».
// Avant 2 ans, l'âge en mois est plus parlant (vaccination, croissance).
export function ageDepuisNaissance(dateNaissance) {
  if (!dateNaissance) return ''
  const naissance = dayjs(dateNaissance)
  if (!naissance.isValid()) return ''
  const aujourdHui = dayjs().tz(fuseauCourant)
  if (naissance.isAfter(aujourdHui, 'day')) return ''
  const ans = aujourdHui.diff(naissance, 'year')
  if (ans >= 2) return `${ans} ans`
  const mois = aujourdHui.diff(naissance, 'month')
  if (mois >= 1) return `${mois} mois`
  const jours = aujourdHui.diff(naissance, 'day')
  return `${jours} jour${jours > 1 ? 's' : ''}`
}

export { dayjs }
