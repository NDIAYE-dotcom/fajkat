// Accueil du jour : libellés, saisie d'une arrivée, adresse du suivi de ticket.

import { SITE } from '../../lib/partage.js'

// Étapes d'un passage, dans l'ordre du tableau de la salle d'attente.
export const ETAPES = {
  waiting: 'En attente',
  vitals: 'Constantes',
  consultation: 'En consultation',
  done: 'Terminé',
  left: 'Parti sans être vu',
}

export const MOTIF_MAX = 500

// Brouillon de l'arrivée. patient : résumé du dossier choisi (pour le réafficher après une
// coupure), jamais plus que ce que montre la recherche.
export const ARRIVEE_VIDE = { patient: null, serviceId: '', priorite: 'normal', motif: '' }

export function resumePatient(p) {
  if (!p) return null
  return {
    id: p.id,
    file_number: p.file_number,
    legacy_file_number: p.legacy_file_number ?? null,
    last_name: p.last_name,
    first_name: p.first_name,
    sex: p.sex,
    birth_date: p.birth_date ?? null,
    birth_date_estimated: p.birth_date_estimated ?? false,
    birth_year: p.birth_year ?? null,
    phone: p.phone ?? null,
    phone_owner: p.phone_owner ?? null,
    neighborhood: p.neighborhood ?? null,
    mother_first_name: p.mother_first_name ?? null,
  }
}

export function validerArrivee(saisie) {
  const erreurs = {}
  if (!saisie.patient) erreurs.patient = 'Choisissez le patient, ou créez son dossier.'
  if (!saisie.serviceId) erreurs.serviceId = 'Choisissez le service où le patient est attendu.'
  if (!saisie.priorite) erreurs.priorite = 'Choisissez la priorité.'
  if (saisie.motif.length > MOTIF_MAX) {
    erreurs.motif = `Le motif ne doit pas dépasser ${MOTIF_MAX} caractères.`
  }
  return erreurs
}

export const ORDRE_CHAMPS_ARRIVEE = ['patient', 'serviceId', 'priorite', 'motif']

// Adresse imprimée dans le QR du ticket : page publique de suivi, sans connexion.
export function adresseSuivi(jeton) {
  return `${SITE.url}/ticket/${jeton}`
}

// « 1 personne », « 3 personnes »
export function personnes(n) {
  return `${n} personne${n > 1 ? 's' : ''}`
}

// --- Tickets de consultation -------------------------------------------------

export const MODES_PAIEMENT = [
  { valeur: 'cash', libelle: 'Espèces' },
  { valeur: 'wave', libelle: 'Wave' },
  { valeur: 'orange_money', libelle: 'Orange Money' },
  { valeur: 'free_money', libelle: 'Free Money' },
]

export function libellePaiement(code) {
  return MODES_PAIEMENT.find((m) => m.valeur === code)?.libelle ?? ''
}

export const REFERENCE_MAX = 60

export const VENTE_VIDE = {
  ...ARRIVEE_VIDE,
  prestationId: '',
  paiement: 'cash',
  reference: '',
  motifGratuiteId: '',
}

// Ordre des champs à l'écran : le curseur va sur la première erreur.
export const ORDRE_CHAMPS_VENTE = [
  ...ORDRE_CHAMPS_ARRIVEE,
  'prestationId',
  'paiement',
  'motifGratuiteId',
  'reference',
]

export function validerVente(saisie, prestation) {
  const erreurs = validerArrivee(saisie)
  if (!prestation) erreurs.prestationId = 'Choisissez la prestation vendue.'
  else if (prestation.price == null) {
    erreurs.prestationId = 'Son tarif n’est pas encore saisi : voyez avec le responsable.'
  }
  if (!saisie.paiement) erreurs.paiement = 'Choisissez le mode de paiement.'
  if (saisie.paiement === 'gratuit' && !saisie.motifGratuiteId) {
    erreurs.motifGratuiteId = 'Choisissez le motif de la gratuité.'
  }
  if (saisie.paiement !== 'gratuit' && prestation?.price === 0) {
    erreurs.paiement = 'Cette prestation est à 0 FCFA : choisissez « Gratuit » et son motif.'
  }
  if (saisie.reference.length > REFERENCE_MAX) {
    erreurs.reference = `La référence ne doit pas dépasser ${REFERENCE_MAX} caractères.`
  }
  return erreurs
}
