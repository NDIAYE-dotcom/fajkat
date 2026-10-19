import dayjs from 'dayjs'
import { getFuseauHoraire } from '../../lib/format.js'
import { debutRdv, PRISE_VIDE, validerRdv } from './prise.js'
import { heureCourte, lireEntier } from './utils.js'

// Série de rendez-vous (une PF tous les 3 mois…) : dates calculées ici, puis contrôlées
// une à une par la base (check_appointment_series) avant l'enregistrement, tout ou rien.

export const NOMBRE_MAX = 24
export const INTERVALLE_MAX = 24

// Brouillon : comme la prise (jamais la note), plus le nombre, l'intervalle et les dates
// préparées (gardées en cas de coupure de courant).
export const SERIE_VIDE = { ...PRISE_VIDE, nombre: '4', intervalle: '3', dates: null }

export const ORDRE_CHAMPS_SERIE = [
  'patient',
  'typeId',
  'praticienId',
  'date',
  'seanceId',
  'heure',
  'nombre',
  'intervalle',
]

export function validerSerie(saisie, options) {
  const erreurs = validerRdv(saisie, options)
  const nombre = lireEntier(saisie.nombre)
  if (nombre === null) erreurs.nombre = 'Tapez le nombre de rendez-vous (2 à 24).'
  else if (!(nombre >= 2 && nombre <= NOMBRE_MAX))
    erreurs.nombre = `Une série compte de 2 à ${NOMBRE_MAX} rendez-vous.`
  const intervalle = lireEntier(saisie.intervalle)
  if (intervalle === null) erreurs.intervalle = 'Tapez l’intervalle en mois (1 à 24).'
  else if (!(intervalle >= 1 && intervalle <= INTERVALLE_MAX))
    erreurs.intervalle = `L’intervalle va de 1 à ${INTERVALLE_MAX} mois.`
  return erreurs
}

// Dates de la série : même heure locale, tous les « intervalle » mois (le 31 devient le
// dernier jour d'un mois plus court, comme en base). La séance choisie ne vaut que pour la
// première date ; pour les suivantes, la base retrouve la séance qui couvre l'heure.
export function genererDates(saisie) {
  const nombre = lireEntier(saisie.nombre)
  const intervalle = lireEntier(saisie.intervalle)
  const depart = dayjs.tz(
    `${saisie.date.date} ${saisie.heure}`,
    'YYYY-MM-DD HH:mm',
    getFuseauHoraire(),
  )
  return Array.from({ length: nombre }, (_, i) => {
    const jour = depart.add(i * intervalle, 'month')
    return {
      cle: `${i}-${jour.format('YYYY-MM-DD')}`,
      date: jour.format('YYYY-MM-DD'),
      heure: saisie.heure,
      seanceId: i === 0 ? saisie.seanceId || '' : '',
      horsSeance: i === 0 ? !saisie.seanceId && !!saisie.horsSeance : false,
    }
  })
}

// Date prête à envoyer : { debut, seanceId, horsSeance }.
export const versEnvoi = (d) => ({
  debut: debutRdv(d.date, d.heure),
  seanceId: d.seanceId,
  horsSeance: d.horsSeance,
})

// Proposition choisie (next_available_sessions) -> nouvelle date de la ligne.
export function depuisPropositionSerie(d, p) {
  return {
    ...d,
    cle: `${d.cle}-${p.local_date}`,
    date: p.local_date,
    heure: heureCourte(p.start_time),
    seanceId: p.session_id ?? '',
    horsSeance: false,
  }
}

// Même heure, le jour suivant (type sans séance : jour férié évité à la main).
export function jourSuivant(d) {
  const date = dayjs(d.date).add(1, 'day').format('YYYY-MM-DD')
  return { ...d, cle: `${d.cle}+`, date, seanceId: '', horsSeance: false }
}

// État d'une date contrôlée : refusée (bloquant), à confirmer (avertissements) ou libre.
export function etatDate(controle) {
  if (!controle) return { code: 'attente', libelle: 'À vérifier', messages: [] }
  const bloquants = controle.blocking ?? []
  const alertes = controle.warnings ?? []
  if (bloquants.length)
    return { code: 'refus', libelle: 'Refusée', messages: bloquants.map((b) => b.message) }
  if (alertes.length)
    return { code: 'alerte', libelle: 'À confirmer', messages: alertes.map((a) => a.message) }
  return { code: 'libre', libelle: 'Libre', messages: [] }
}

// Une date qui gagnerait à changer : refusée, ou jour férié / jour fermé à confirmer.
export function aDeplacer(controle) {
  const codes = [...(controle?.blocking ?? []), ...(controle?.warnings ?? [])].map((x) => x.code)
  return codes.some((c) => ['full', 'holiday', 'closed', 'series_same_day', 'past'].includes(c))
}
