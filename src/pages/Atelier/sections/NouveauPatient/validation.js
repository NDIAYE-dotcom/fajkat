import { estTelephoneValide } from '../../../../lib/pays.js'

export const PATIENT_VIDE = {
  prenom: '',
  nom: '',
  sexe: '',
  naissance: { type: 'date', date: null, texte: '' },
  prenomMere: '',
  telephone: '',
  proprietaire: 'patient',
  quartier: '',
  langue: 'fr',
  rappels: true,
  priseEnCharge: 'aucune',
  numeroAdherent: '',
  avance: null,
  observations: '',
}

// Ordre des champs à l'écran : le focus va sur la première erreur.
export const ORDRE_CHAMPS = ['prenom', 'nom', 'sexe', 'naissance', 'telephone', 'numeroAdherent']

// Validation de démonstration (les vraies règles viendront avec le module patients).
// Messages : ce qui ne va pas et comment corriger, sans jargon.
export function validerPatient(patient) {
  const erreurs = {}
  if (!patient.prenom.trim()) erreurs.prenom = 'Saisissez le prénom.'
  if (!patient.nom.trim()) erreurs.nom = 'Saisissez le nom de famille.'
  if (!patient.sexe) erreurs.sexe = 'Choisissez Femme ou Homme.'

  const { naissance } = patient
  if (naissance.type === 'date') {
    if (!naissance.texte) {
      erreurs.naissance = 'Saisissez la date de naissance, ou cochez « âge déclaré ».'
    } else if (!naissance.date) {
      erreurs.naissance = 'Date incomplète ou inexistante : utilisez le format JJ/MM/AAAA.'
    } else if (naissance.date > new Date().toISOString().slice(0, 10)) {
      erreurs.naissance = 'La date de naissance ne peut pas être dans le futur.'
    }
  } else if (naissance.age === null) {
    erreurs.naissance = "Saisissez l'âge déclaré."
  } else if (naissance.unite === 'ans' && naissance.age > 120) {
    erreurs.naissance = "Vérifiez l'âge : plus de 120 ans."
  }

  if (patient.telephone && !estTelephoneValide(patient.telephone)) {
    erreurs.telephone = 'Numéro incomplet : vérifiez le nombre de chiffres.'
  }
  if (patient.priseEnCharge !== 'aucune' && !patient.numeroAdherent.trim()) {
    erreurs.numeroAdherent = "Saisissez le numéro d'adhérent figurant sur la carte."
  }
  return erreurs
}
