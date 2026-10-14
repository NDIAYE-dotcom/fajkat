// Module Personnel : liens d'invitation, message WhatsApp, statuts, matrice des permissions.

import dayjs from 'dayjs'
import { formatDate } from '../../lib/format.js'
import { ENTREES, featureIncluse, ROLES, TOUS_LES_ROLES } from '../../router/navigation.js'
import { libelleRole as libelleRoleEquipe, rolesPour } from '../admin/utils.js'

export function lienInvitation(jeton) {
  return `${window.location.origin}/invitation/${jeton}`
}

// Message pré-rempli, en français, sans accord de genre.
export function messageInvitation({ prenom, structure, role, lien, expireLe }) {
  return [
    `Bonjour${prenom ? ` ${prenom}` : ''},`,
    `« ${structure} » vous invite à rejoindre son équipe sur Fajkat (rôle : ${libelleRoleMinuscule(role)}).`,
    `Ouvrez ce lien pour créer votre compte ou vous connecter : ${lien}`,
    `Ce lien est personnel, à usage unique, valable jusqu’au ${formatDate(expireLe)}.`,
  ].join('\n\n')
}

// wa.me : numéro sans « + » ; sans numéro, WhatsApp demande à qui envoyer.
export function lienWhatsApp(telephone, message) {
  const numero = telephone ? telephone.replace(/\D/g, '') : ''
  return `https://wa.me/${numero}?text=${encodeURIComponent(message)}`
}

export function prenomDe(nomComplet) {
  return nomComplet?.trim().split(/\s+/)[0] ?? ''
}

export function libelleRole(role) {
  return ROLES[role] ?? role
}

// Libellé complet (« Infirmier ou infirmière ») pour les messages et les listes.
function libelleRoleMinuscule(role) {
  const libelle = libelleRoleEquipe(role)
  return libelle.charAt(0).toLowerCase() + libelle.slice(1)
}

// Rôles proposés selon l'offre (laborantin : clinique ; agent communautaire : poste).
// Jamais owner à l'invitation ; owner seulement pour un owner qui modifie un membre
// (règle aussi tenue par la base).
export function rolesAttribuables(roleUtilisateur, type, { invitation = false } = {}) {
  const roles = rolesPour(type).map(({ valeur, libelle }) => ({ valeur, libelle }))
  if (!invitation && roleUtilisateur === 'owner') {
    return [{ valeur: 'owner', libelle: 'Propriétaire' }, ...roles]
  }
  return roles
}

// pending + date passée = expirée (aucune tâche planifiée n'est nécessaire).
export function statutInvitation(invitation) {
  if (invitation.status === 'accepted') return 'acceptee'
  if (invitation.status === 'revoked') return 'annulee'
  if (new Date(invitation.expires_at) <= new Date()) return 'expiree'
  return 'en_attente'
}

export const STATUTS_INVITATION = {
  en_attente: { libelle: 'En attente', ton: 'primaire' },
  expiree: { libelle: 'Expirée', ton: 'neutre' },
  acceptee: { libelle: 'Acceptée', ton: 'encre' },
  annulee: { libelle: 'Annulée', ton: 'neutre' },
}

export const LIBELLES_CANAL = { whatsapp: 'WhatsApp', lien: 'Lien copié', email: 'E-mail' }

// Matrice module × rôle, tirée de navigation.js (même source que le menu) et limitée
// aux modules de l'offre de la structure.
export function matricePermissions(features) {
  const entrees = ENTREES.filter((e) => featureIncluse(e, features))
  return {
    roles: TOUS_LES_ROLES,
    lignes: entrees.map((e) => ({
      code: e.code,
      libelle: e.libelle,
      famille: e.famille,
      roles: new Set(e.roles),
    })),
  }
}

// Copie dans le presse-papiers ; repli pour les navigateurs sans API Clipboard (http, vieux Android).
export async function copierTexte(texte) {
  try {
    await navigator.clipboard.writeText(texte)
    return true
  } catch {
    try {
      const zone = document.createElement('textarea')
      zone.value = texte
      zone.setAttribute('readonly', '')
      zone.style.position = 'fixed'
      zone.style.opacity = '0'
      document.body.appendChild(zone)
      zone.select()
      const ok = document.execCommand('copy')
      zone.remove()
      return ok
    } catch {
      return false
    }
  }
}

// --- Fiches du personnel -------------------------------------------------------

export const CONTRATS = [
  { valeur: 'titulaire', libelle: 'Titulaire' },
  { valeur: 'contractuel', libelle: 'Contractuel' },
  { valeur: 'benevole', libelle: 'Bénévole' },
  { valeur: 'vacataire', libelle: 'Vacataire' },
]

export function libelleContrat(valeur) {
  return CONTRATS.find((c) => c.valeur === valeur)?.libelle ?? ''
}

// Pièces jointes acceptées (mêmes règles que le bucket « personnel »).
export const TYPES_PIECE = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
export const POIDS_MAX_PIECE = 10 * 1024 * 1024

export function formatPoids(octets) {
  if (octets < 1024 * 1024) return `${Math.max(1, Math.round(octets / 1024))} Ko`
  return `${(octets / (1024 * 1024)).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo`
}

// --- Planning des gardes -------------------------------------------------------

// Jour du calendrier 'AAAA-MM-JJ' : manipulé sans fuseau (une date de garde n'a pas d'heure).
const JOUR = 'YYYY-MM-DD'

// Aujourd'hui dans le fuseau de la structure.
export function aujourdhui() {
  return dayjs.tz().format(JOUR)
}

// Lundi de la semaine qui contient ce jour.
export function lundiDe(jour) {
  const d = dayjs(jour)
  return d.subtract((d.day() + 6) % 7, 'day').format(JOUR)
}

export function decalerJours(jour, nombre) {
  return dayjs(jour).add(nombre, 'day').format(JOUR)
}

export function joursDeLaSemaine(lundi) {
  return Array.from({ length: 7 }, (_, i) => decalerJours(lundi, i))
}

// « lundi 3 novembre » ; court : « lun. 3/11 ».
export function libelleJour(jour, { court = false } = {}) {
  return dayjs(jour).format(court ? 'ddd D/MM' : 'dddd D MMMM')
}

export function formatJour(jour) {
  return dayjs(jour).format('DD/MM/YYYY')
}

// '08:00:00' -> '08:00'
export function heureCourte(heure) {
  return heure ? heure.slice(0, 5) : ''
}

// « 08:00 – 20:00 » ; fin avant ou égale au début : le créneau finit le lendemain.
export function horairesCreneau(creneau) {
  const debut = heureCourte(creneau.start_time)
  const fin = heureCourte(creneau.end_time)
  if (debut === fin) return `${debut} – ${fin} le lendemain (24 h)`
  if (fin < debut) return `${debut} – ${fin} le lendemain`
  return `${debut} – ${fin}`
}

// Affectations rangées par case : « AAAA-MM-JJ|creneauId » -> [{ id, membre }].
export function indexerAffectations(affectations, membres) {
  const parId = new Map((membres ?? []).map((m) => [m.id, m]))
  const cases = new Map()
  for (const a of affectations ?? []) {
    const cle = `${a.shift_date}|${a.shift_type_id}`
    const liste = cases.get(cle) ?? []
    liste.push({ id: a.id, membre: parId.get(a.membership_id) ?? null, membreId: a.membership_id })
    cases.set(cle, liste)
  }
  for (const liste of cases.values()) {
    liste.sort((a, b) => nomMembre(a.membre).localeCompare(nomMembre(b.membre), 'fr'))
  }
  return cases
}

export function nomMembre(membre) {
  return membre?.profil?.full_name || 'Membre sans nom'
}

// --- Présences -------------------------------------------------------------------

// Durée entre deux instants : « 8 h 05 » ; null si le départ manque.
export function dureeEntre(debut, fin) {
  if (!debut || !fin) return null
  const minutes = Math.max(0, Math.round((new Date(fin) - new Date(debut)) / 60000))
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}`
}

// Jour 'AAAA-MM-JJ' + heure 'HH:mm' saisis dans le fuseau de la structure -> ISO (UTC).
export function versInstant(jour, heure) {
  return dayjs.tz(`${jour}T${heure}:00`).toISOString()
}

// Instant ISO -> 'HH:mm' dans le fuseau de la structure (champ <input type="time">).
export function heureDe(instant) {
  return instant ? dayjs(instant).tz().format('HH:mm') : ''
}

export function statutPresence(presence) {
  if (!presence) return { libelle: 'Absent', ton: 'neutre' }
  if (!presence.check_out_at) return { libelle: 'Présent', ton: 'primaire' }
  return { libelle: 'Parti', ton: 'encre' }
}
