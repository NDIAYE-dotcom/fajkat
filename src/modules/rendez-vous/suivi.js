import { formatHeure, formatTelephone } from '../../lib/format.js'
import { LANGUES } from '../patients/fiche.js'
import { libelleTelephoneDe } from '../patients/utils.js'

// Suivi des rendez-vous (sans affichage) : statuts, annulation, rappels de la veille,
// rendez-vous d'un patient, planning imprimé.

// Ce qu'un rôle peut faire d'un rendez-vous, selon son statut et son jour (comme la base,
// qui décide : set_appointment_status, arrive_appointment).
//   droits : { write, queue } (appointment_permissions) ; aujourdhui : « AAAA-MM-JJ ».
export function actionsStatut(rdv, droits, aujourdhui) {
  const ecrire = Boolean(droits.write)
  const ouvert = ['scheduled', 'confirmed'].includes(rdv.status)
  return {
    confirmer: ecrire && rdv.status === 'scheduled',
    remettre: ecrire && ['confirmed', 'no_show'].includes(rdv.status),
    arrive:
      ecrire &&
      Boolean(droits.queue) &&
      (ouvert || rdv.status === 'no_show') &&
      rdv.local_date === aujourdhui,
    absent: ecrire && ouvert && rdv.local_date <= aujourdhui,
    annuler: ecrire && ouvert,
  }
}

// Motifs d'annulation proposés à l'accueil (un clic) ; « Autre » demande un texte.
export const MOTIFS_ANNULATION = [
  'Le patient a prévenu',
  'Patient en voyage',
  'Structure fermée',
  'Autre',
]
export const MOTIF_MAX = 300

// Motif envoyé à la base, ou message d'erreur sous la case.
export function motifAnnulation({ choix, autre }) {
  if (!choix) return { erreur: 'Choisissez le motif de l’annulation.' }
  if (choix !== 'Autre') return { motif: choix }
  const texte = (autre ?? '').trim()
  if (!texte) return { erreur: 'Écrivez le motif de l’annulation.' }
  if (texte.length > MOTIF_MAX) return { erreur: `${MOTIF_MAX} caractères au plus.` }
  return { motif: texte }
}

// --- Rappels de la veille ----------------------------------------------------------------

export const libelleLangue = (code) => LANGUES.find((l) => l.valeur === code)?.libelle ?? ''

// Rendez-vous regroupés par téléphone : une famille est prévenue en un seul appel. Les
// patients sans téléphone forment chacun un groupe (« Aucun téléphone »).
export function grouperParTelephone(rappels) {
  const groupes = new Map()
  for (const r of rappels) {
    const cle = r.phone ? `tel:${r.phone}` : `sans:${r.appointment_id}`
    if (!groupes.has(cle)) groupes.set(cle, { cle, telephone: r.phone ?? null, rdv: [] })
    groupes.get(cle).rdv.push(r)
  }
  return [...groupes.values()].map((g) => ({
    ...g,
    // Le premier rendez-vous de la famille ordonne la liste (la base trie par heure).
    // « Téléphone de la patiente » ou « du patient » : accordé au sexe de chacun.
    titulaires: [
      ...new Set(
        g.rdv.map((r) => libelleTelephoneDe(r.phone_owner, r.patient_sex)).filter(Boolean),
      ),
    ],
    whatsapp: g.rdv.every((r) => r.whatsapp_consent),
    langues: [...new Set(g.rdv.map((r) => r.preferred_language).filter(Boolean))],
    fait: g.rdv.every((r) => r.reminder_done_at),
  }))
}

export function libelleTelephone(groupe) {
  if (!groupe.telephone) return 'Aucun téléphone'
  return formatTelephone(groupe.telephone)
}

// « Téléphone de la mère · Téléphone du patient » ; « Titulaire non renseigné » sinon.
export function libelleTitulaires(titulaires) {
  if (titulaires.length === 0) return 'Titulaire non renseigné'
  return titulaires.join(' · ')
}

// Message prévu pour le patient : jamais le nom d'un type discret (patient_label vient de
// la base). Le prénom dit pour qui est le rendez-vous quand la famille partage le
// téléphone. L'envoi WhatsApp viendra aux étapes 23 et 24.
export function messageRappel(r, nomStructure) {
  const qui = [r.patient_first_name, r.patient_last_name].filter((x) => x?.trim()).join(' ')
  const label = r.patient_label ?? 'votre rendez-vous'
  return (
    `Bonjour. Rappel${qui ? ` pour ${qui}` : ''} : ${label} demain à ` +
    `${formatHeure(r.starts_at)}. ${nomStructure}.`
  )
}

// --- Rendez-vous d'un patient -------------------------------------------------------------

// À venir : prévus ou confirmés, aujourd'hui ou plus tard ; le reste est passé.
export function separerRdvPatient(liste, aujourdhui) {
  const aVenir = []
  const passes = []
  for (const r of liste) {
    if (['scheduled', 'confirmed'].includes(r.status) && r.local_date >= aujourdhui) aVenir.push(r)
    else passes.push(r)
  }
  aVenir.sort((a, b) => a.starts_at.localeCompare(b.starts_at))
  return { aVenir, passes }
}

// « Venu 3 fois · absent 1 fois · taux d'absence 25 % » ; null sans rendez-vous passé.
export function resumeAbsences(stats) {
  if (!stats || stats.no_show_rate === null || stats.no_show_rate === undefined) return null
  const fois = (n) => `${n} fois`
  return {
    texte: `Venu ${fois(stats.arrived ?? 0)} · absent ${fois(stats.no_show ?? 0)}`,
    taux: stats.no_show_rate,
  }
}

// --- Planning imprimé ---------------------------------------------------------------------

// Libellé imprimé : neutre par défaut pour tout le monde (un papier traîne sur le bureau
// de l'accueil) ; « types réels » seulement dans la version soignant.
export function libellePlanning(rdv, versionSoignant) {
  if (rdv.is_discreet && !versionSoignant) return 'Consultation'
  return rdv.type_label ?? 'Consultation'
}
