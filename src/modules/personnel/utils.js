// Module Personnel : liens d'invitation, message WhatsApp, statuts, matrice des permissions.

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
