// État de l'abonnement d'une structure, d'après organizations.status (trial, active, grace,
// read_only, suspended). Affichage seulement : la logique réelle (échéances, paiements,
// passage en lecture seule) arrive à l'étape 10.

import { dayjs } from './format.js'

// Jours d'essai restants, arrondis au jour supérieur (il reste « 1 jour » jusqu'à la fin).
export function joursRestants(finEssai) {
  if (!finEssai) return null
  const heures = dayjs(finEssai).diff(dayjs(), 'hour', true)
  return Math.max(0, Math.ceil(heures / 24))
}

export const LIBELLES_STATUT = {
  trial: 'Essai gratuit',
  active: 'Abonnement actif',
  grace: 'Période de grâce',
  read_only: 'Lecture seule',
  suspended: 'Accès suspendu',
}

// Rôles qui voient l'état de l'abonnement (même règle que la page /app/abonnement).
const ROLES_BANDEAU = ['owner', 'admin']

// { ton: 'info' | 'attention' | 'erreur', titre, texte } ou null (rien à afficher).
// L'abonnement ne regarde que owner et admin ; en lecture seule, les autres rôles sont
// seulement prévenus que la saisie est suspendue.
export function bandeauAbonnement(structure, role) {
  if (!ROLES_BANDEAU.includes(role)) {
    return structure?.status === 'read_only'
      ? {
          ton: 'erreur',
          titre: 'Saisie suspendue',
          texte: 'Contactez le responsable de la structure.',
        }
      : null
  }
  switch (structure?.status) {
    case 'trial': {
      const jours = joursRestants(structure.trial_ends_at)
      if (jours === null) {
        return {
          ton: 'info',
          titre: 'Période d’essai',
          texte: 'Toutes les fonctions sont ouvertes.',
        }
      }
      if (jours === 0) {
        return {
          ton: 'attention',
          titre: 'Votre essai est terminé',
          texte: 'Choisissez votre abonnement pour continuer à enregistrer.',
        }
      }
      return {
        ton: 'info',
        titre: `Il vous reste ${jours} ${jours > 1 ? 'jours' : 'jour'} d’essai`,
        texte: 'Toutes les fonctions de votre offre sont ouvertes.',
      }
    }
    case 'grace':
      return {
        ton: 'attention',
        titre: 'Votre abonnement est arrivé à échéance',
        texte:
          'Vous gardez l’accès complet quelques jours. Renouvelez-le pour éviter la lecture seule.',
      }
    case 'read_only':
      return {
        ton: 'erreur',
        titre: 'Lecture seule',
        texte: 'Vos données restent consultables, mais aucune nouvelle saisie n’est possible.',
      }
    case 'suspended':
      return {
        ton: 'erreur',
        titre: 'Accès suspendu',
        texte: 'Contactez Fajkat pour rétablir l’accès. Vos données sont conservées.',
      }
    default:
      return null
  }
}
