import dayjs from 'dayjs'
import { getFuseauHoraire } from '../../lib/format.js'
import { dateFr, heureCourte, versDateInput } from './utils.js'

// Logique de la prise et du report d'un rendez-vous (sans affichage).

// Brouillon de la prise : jamais la note (secret médical), jamais le nom d'un type ; le
// type n'y est qu'un identifiant, oublié s'il n'est pas visible par l'utilisateur.
export const PRISE_VIDE = {
  patient: null,
  typeId: '',
  praticienId: '',
  date: versDateInput(null),
  seanceId: '',
  // Coché seulement par l'utilisateur : jamais d'office (une séance pleine ne bascule
  // pas en « hors séance »).
  horsSeance: false,
  heure: '',
}

export const ORDRE_CHAMPS_PRISE = ['patient', 'typeId', 'praticienId', 'date', 'seanceId', 'heure']

const HEURE = /^([01]\d|2[0-3]):[0-5]\d$/

// Erreurs sous les cases. avecPatient / avecType : faux pour un report (ni l'un ni l'autre
// ne changent). nbSeances : séances proposées ce jour-là ; s'il y en a, il faut en choisir
// une ou cocher « Autre heure, hors séance ».
export function validerRdv(saisie, { avecPatient = true, avecType = true, nbSeances = 0 } = {}) {
  const erreurs = {}
  if (avecPatient && !saisie.patient)
    erreurs.patient = 'Choisissez le patient, ou créez son dossier.'
  if (avecType && !saisie.typeId) erreurs.typeId = 'Choisissez le type de rendez-vous.'
  if (!saisie.date?.date) {
    erreurs.date = saisie.date?.texte
      ? 'Cette date n’existe pas : vérifiez le jour et le mois.'
      : 'Tapez la date (JJ/MM/AAAA).'
  }
  if (!saisie.seanceId && nbSeances > 0 && !saisie.horsSeance) {
    erreurs.seanceId = 'Choisissez une séance, ou « Autre heure, hors séance ».'
  } else if (!saisie.seanceId) {
    if (!saisie.heure) erreurs.heure = 'Choisissez une séance ou tapez l’heure (exemple : 09:30).'
    else if (!HEURE.test(saisie.heure)) erreurs.heure = 'Tapez l’heure ainsi : 09:30.'
  }
  return erreurs
}

// Début du rendez-vous (ISO, UTC) depuis la date et l'heure locales de la structure.
export function debutRdv(date, heure) {
  return dayjs.tz(`${date} ${heure}`, 'YYYY-MM-DD HH:mm', getFuseauHoraire()).toISOString()
}

// Séances du type ce jour-là (avec leurs places prises : seancesDuJour), pour le praticien
// choisi s'il y en a un.
export function seancesPossibles(seancesJour, typeId, praticienId) {
  return seancesJour.filter(
    (s) =>
      s.appointment_type_id === typeId &&
      (!praticienId ||
        !s.practitioner_membership_id ||
        s.practitioner_membership_id === praticienId),
  )
}

// « 3 places », « 1 place », « Complet », « Places libres » (séance sans capacité).
export function libellePlaces(reste) {
  if (reste === null || reste === undefined) return 'Places libres'
  if (reste <= 0) return 'Complet'
  return `${reste} place${reste > 1 ? 's' : ''}`
}

// Une séance proposée (next_available_sessions) : « mardi 27/10 · 08:00 – 12:00 · 3 places ».
// Rendez-vous discret masqué : ni heure de fin ni séance.
export function libelleProposition(p) {
  const jour = dayjs(p.local_date).format('dddd')
  const horaire = p.end_time
    ? `${heureCourte(p.start_time)} – ${heureCourte(p.end_time)}`
    : heureCourte(p.start_time)
  return `${jour} ${dateFr(p.local_date).slice(0, 5)} · ${horaire} · ${libellePlaces(p.places_left)}`
}

// Séance sans place (capacité atteinte) ; une séance sans capacité n'est jamais pleine.
export function seancePleine(s) {
  return s.capacity !== null && s.capacity !== undefined && s.prises >= s.capacity
}

// Message d'une séance pleine, affiché dès qu'elle est choisie (la base le redit à l'envoi).
export function messagePleine(s, iso) {
  return `Séance pleine le ${dateFr(iso)} de ${heureCourte(s.start_time)} à ${heureCourte(s.end_time)} : ${s.prises} / ${s.capacity} rendez-vous.`
}

// Proposition choisie -> champs de la saisie.
export function depuisProposition(p) {
  return {
    date: versDateInput(p.local_date),
    seanceId: p.session_id ?? '',
    horsSeance: false,
    heure: heureCourte(p.start_time),
  }
}
