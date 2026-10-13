import dayjs from 'dayjs'
import 'dayjs/locale/fr'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'

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

// Groupement par pays (indicatif -> tailles des blocs du numéro national).
const GROUPES_PAR_INDICATIF = {
  221: [2, 3, 2, 2], // Sénégal : 77 123 45 67
  223: [2, 2, 2, 2], // Mali
  225: [2, 2, 2, 2, 2], // Côte d'Ivoire
  226: [2, 2, 2, 2], // Burkina Faso
  227: [2, 2, 2, 2], // Niger
  228: [2, 2, 2, 2], // Togo
  229: [2, 2, 2, 2, 2], // Bénin
  245: [3, 3, 3], // Guinée-Bissau
}

// « +221771234567 » -> « +221 77 123 45 67 ». Numéro non reconnu : renvoyé tel quel.
export function formatTelephone(e164) {
  if (!e164) return ''
  const brut = String(e164).replace(/[^\d+]/g, '')
  const match = brut.match(/^\+(\d{3})(\d+)$/)
  if (!match) return String(e164)
  const [, indicatif, national] = match
  const groupes = GROUPES_PAR_INDICATIF[indicatif]
  if (!groupes || groupes.reduce((a, b) => a + b, 0) !== national.length) {
    return `+${indicatif} ${national}`
  }
  const blocs = []
  let position = 0
  for (const taille of groupes) {
    blocs.push(national.slice(position, position + taille))
    position += taille
  }
  return `+${indicatif} ${blocs.join(' ')}`
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
