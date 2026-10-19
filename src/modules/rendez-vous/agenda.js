import dayjs from 'dayjs'
import { getFuseauHoraire } from '../../lib/format.js'
import { libelleAge, libelleNaissance } from '../patients/utils.js'
import { libelleJour } from './utils.js'

// Logique de l'agenda (sans affichage) : dates locales « AAAA-MM-JJ », périodes des vues,
// colonnes du jour, remplissage des séances.

export const VUES = [
  { id: 'jour', libelle: 'Jour' },
  { id: 'semaine', libelle: 'Semaine' },
  { id: 'liste', libelle: 'Liste' },
]

// La vue « Liste » couvre deux semaines à partir de la date choisie.
export const JOURS_LISTE = 14

// Statuts : libellé et ton du tampon. Le texte reste toujours écrit.
export const STATUTS_RDV = {
  scheduled: { libelle: 'Prévu', ton: 'encre' },
  confirmed: { libelle: 'Confirmé', ton: 'primaire' },
  arrived: { libelle: 'Arrivé', ton: 'primaire' },
  no_show: { libelle: 'Absent', ton: 'alerte' },
  cancelled: { libelle: 'Annulé', ton: 'neutre' },
  rescheduled: { libelle: 'Reporté', ton: 'neutre' },
}

// Rendez-vous qui occupent une place (comme la base pour la capacité des séances).
const STATUTS_OCCUPANTS = ['scheduled', 'confirmed', 'arrived']
export const estOccupant = (rdv) => STATUTS_OCCUPANTS.includes(rdv.status)
// Annulés et reportés : masqués par défaut (le nouveau rendez-vous d'un report est affiché).
export const estClos = (rdv) => ['cancelled', 'rescheduled'].includes(rdv.status)

export function aujourdhui() {
  return dayjs().tz(getFuseauHoraire()).format('YYYY-MM-DD')
}

export function dateValide(iso) {
  return /^\d{4}-\d{2}-\d{2}$/.test(iso ?? '') && dayjs(iso).format('YYYY-MM-DD') === iso
}

export function ajouterJours(iso, n) {
  return dayjs(iso).add(n, 'day').format('YYYY-MM-DD')
}

// Jour ISO (1 = lundi … 7 = dimanche), comme appointment_sessions.weekday.
export function jourIso(iso) {
  return ((dayjs(iso).day() + 6) % 7) + 1
}

export function lundiDe(iso) {
  return ajouterJours(iso, 1 - jourIso(iso))
}

// Période chargée pour une vue : { du, au }.
export function periode(vue, date) {
  if (vue === 'semaine') {
    const du = lundiDe(date)
    return { du, au: ajouterJours(du, 6) }
  }
  if (vue === 'liste') return { du: date, au: ajouterJours(date, JOURS_LISTE - 1) }
  return { du: date, au: date }
}

export function joursDe({ du, au }) {
  const jours = []
  for (let d = du; d <= au; d = ajouterJours(d, 1)) jours.push(d)
  return jours
}

// Pas de navigation : un jour, une semaine, ou deux semaines (liste).
export function decaler(vue, date, sens) {
  const pas = vue === 'semaine' ? 7 : vue === 'liste' ? JOURS_LISTE : 1
  return ajouterJours(date, sens * pas)
}

// « 1er » pour le premier du mois, comme on l'écrit en français.
function jourDuMois(iso, format) {
  const d = dayjs(iso)
  return d.format(format).replace(/^1(?= |$)/, '1er')
}

// « vendredi 16 octobre 2026 », « Semaine du 26 octobre au 1er novembre 2026 »,
// « Du 16/10 au 29/10/2026 ».
export function titrePeriode(vue, date) {
  const { du, au } = periode(vue, date)
  if (vue === 'jour') return dayjs(date).format('dddd ') + jourDuMois(date, 'D MMMM YYYY')
  if (vue === 'semaine') {
    const memeMois = du.slice(0, 7) === au.slice(0, 7)
    return `Semaine du ${jourDuMois(du, memeMois ? 'D' : 'D MMMM')} au ${jourDuMois(au, 'D MMMM YYYY')}`
  }
  return `Du ${dayjs(du).format('DD/MM')} au ${dayjs(au).format('DD/MM/YYYY')}`
}

// Horaires d'ouverture (étape 7, settings.opening_hours) : true si le jour est fermé.
const CLES_JOURS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']
export function estFerme(settings, iso) {
  return settings?.opening_hours?.[CLES_JOURS[jourIso(iso) - 1]]?.statut === 'ferme'
}

// Premier jour ouvert (ni férié, ni fermé) après « apres » et pas avant aujourd'hui ;
// null si aucun dans les « limite » jours. feries : dates « AAAA-MM-JJ ».
export function prochainJourOuvert(settings, feries, apres, limite = 60) {
  const ferie = new Set(feries)
  const auj = aujourdhui()
  let jour = ajouterJours(apres > auj ? apres : auj, apres >= auj ? 1 : 0)
  for (let i = 0; i < limite; i += 1, jour = ajouterJours(jour, 1)) {
    if (!ferie.has(jour) && !estFerme(settings, jour)) return jour
  }
  return null
}

// Séances qui ont lieu ce jour-là, avec le nombre de places prises.
export function seancesDuJour(seances, rdv, iso) {
  const jour = jourIso(iso)
  return seances
    .filter((s) => s.is_active && s.weekday === jour)
    .map((s) => ({
      ...s,
      prises: rdv.filter((r) => r.session_id === s.id && r.local_date === iso && estOccupant(r))
        .length,
    }))
}

// Colonnes de la vue jour :
//   poste    : une colonne par activité (libellé du type, neutre pour un type discret
//              quand le rôle ne doit pas le voir) ;
//   clinique : une colonne par praticien, et « Sans praticien » s'il le faut.
// Une colonne apparaît si elle a un rendez-vous ou une séance ce jour-là.
export function colonnesDuJour({ multiPraticiens, rdv, seances, types, praticiens }) {
  if (multiPraticiens) {
    const ids = new Set([
      ...rdv.map((r) => r.practitioner_membership_id ?? 'aucun'),
      ...seances.map((s) => s.practitioner_membership_id).filter(Boolean),
    ])
    const nom = (id) =>
      praticiens.find((p) => p.id === id)?.nom ??
      rdv.find((r) => r.practitioner_membership_id === id)?.practitioner_name ??
      'Praticien'
    return [...ids]
      .map((id) => ({
        id,
        titre: id === 'aucun' ? 'Sans praticien' : nom(id),
        rdv: rdv.filter((r) => (r.practitioner_membership_id ?? 'aucun') === id),
        seances: seances.filter((s) => s.practitioner_membership_id === id),
      }))
      .sort(
        (a, b) => (a.id === 'aucun') - (b.id === 'aucun') || a.titre.localeCompare(b.titre, 'fr'),
      )
  }
  // Poste : colonnes par libellé du type tel que la base le renvoie. Pour l'accueil et le
  // caissier, un type discret arrive sous un libellé neutre (sa file, ou « Consultation ») :
  // il rejoint la colonne qui porte ce libellé, sans jamais révéler son nom.
  const titreSeance = (s) => types.find((t) => t.id === s.appointment_type_id)?.label ?? 'Séance'
  const titres = new Set([
    ...rdv.map((r) => r.type_label ?? 'Consultation'),
    ...seances.map(titreSeance),
  ])
  const ordre = (titre) => {
    const i = types.findIndex((t) => t.label === titre)
    return i === -1 ? types.length : i
  }
  return [...titres]
    .sort((a, b) => ordre(a) - ordre(b) || a.localeCompare(b, 'fr'))
    .map((titre) => ({
      id: titre,
      titre,
      rdv: rdv.filter((r) => (r.type_label ?? 'Consultation') === titre),
      seances: seances.filter((s) => titreSeance(s) === titre),
    }))
}

export const nomJour = (iso) => libelleJour(jourIso(iso))

// Pour distinguer deux homonymes (deux Fatou Diop) : âge exact, sinon « née vers 1996 »
// ou « né vers juillet 2024 » (date estimée). Vide si rien n'est connu.
export function ageOuNaissance(rdv) {
  const patient = {
    sex: rdv.patient_sex,
    birth_date: rdv.birth_date,
    birth_date_estimated: rdv.birth_date_estimated,
    birth_year: rdv.birth_year,
  }
  if (patient.birth_date && !patient.birth_date_estimated) return libelleAge(patient)
  return libelleNaissance(patient)
}
