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

// { ton: 'info' | 'attention' | 'erreur', titre, texte } ou null (abonnement actif).
export function bandeauAbonnement(structure) {
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
