// Assistant de démarrage : étapes, progression (organizations.settings.onboarding),
// libellés des rôles, des catégories de services, des tiers payants et des jours.

export const ETAPES_DEMARRAGE = [
  { code: 'identite', libelle: 'Identité' },
  { code: 'equipe', libelle: 'Équipe' },
  { code: 'services', libelle: 'Services et tarifs' },
  { code: 'tiers_payants', libelle: 'Tiers payants' },
  { code: 'recapitulatif', libelle: 'Récapitulatif' },
]

export const CODES_ETAPES = ETAPES_DEMARRAGE.map((etape) => etape.code)

// settings.onboarding = { etapes: { identite: 'faite' | 'passee', … }, equipe_seul,
//                         aucun_tiers_payant, vu_le, termine_le }
export function lireOnboarding(settings) {
  const brut = settings?.onboarding
  const onboarding = brut && typeof brut === 'object' ? brut : {}
  return { ...onboarding, etapes: { ...(onboarding.etapes ?? {}) } }
}

// Un écran passé ne compte pas : seules les réponses données (ou explicites) comptent.
export function progression(onboarding) {
  const faites = CODES_ETAPES.filter((code) => onboarding.etapes[code] === 'faite').length
  return { faites, total: CODES_ETAPES.length, termine: faites === CODES_ETAPES.length }
}

export function etapesRestantes(onboarding) {
  return ETAPES_DEMARRAGE.filter((etape) => onboarding.etapes[etape.code] !== 'faite')
}

// Reprise : le premier écran pas encore fait (le récapitulatif si tout le reste l'est).
export function premiereEtapeAFaire(onboarding) {
  return etapesRestantes(onboarding)[0]?.code ?? 'recapitulatif'
}

export function peutConfigurer(role) {
  return role === 'owner' || role === 'admin'
}

// Première connexion d'un owner : l'assistant s'ouvre de lui-même, une seule fois.
export function doitOuvrirAssistant(structure) {
  return structure?.role === 'owner' && !lireOnboarding(structure.settings).vu_le
}

// --- Rôles proposés pour les premiers membres (jamais owner) -----------------
// offres : types de structure où le rôle a un sens (les modules liés n'existent pas ailleurs).

export const ROLES_EQUIPE = [
  { valeur: 'admin', libelle: 'Administrateur ou administratrice' },
  { valeur: 'medecin', libelle: 'Médecin' },
  { valeur: 'sage_femme', libelle: 'Sage-femme' },
  { valeur: 'infirmier', libelle: 'Infirmier ou infirmière' },
  { valeur: 'aide_soignant', libelle: 'Aide-soignant ou aide-soignante' },
  { valeur: 'pharmacien', libelle: 'Pharmacien ou dépositaire' },
  { valeur: 'caissier', libelle: 'Caissier ou caissière' },
  { valeur: 'comptable', libelle: 'Comptable' },
  { valeur: 'accueil', libelle: 'Accueil' },
  { valeur: 'laborantin', libelle: 'Laborantin ou laborantine', offres: ['clinique'] },
  {
    valeur: 'agent_communautaire',
    libelle: 'Agent ou relais communautaire',
    offres: ['poste_sante'],
  },
]

export function rolesPour(type) {
  return ROLES_EQUIPE.filter((role) => !role.offres || role.offres.includes(type))
}

export function libelleRole(valeur) {
  return ROLES_EQUIPE.find((role) => role.valeur === valeur)?.libelle ?? valeur
}

// --- Services ----------------------------------------------------------------

export const CATEGORIES_SERVICES = [
  { code: 'consultation', libelle: 'Consultations' },
  { code: 'maternite', libelle: 'Santé de la mère' },
  { code: 'soins', libelle: 'Soins' },
  { code: 'hospitalisation', libelle: 'Hospitalisation et observation' },
  { code: 'examens', libelle: 'Examens' },
  { code: 'documents', libelle: 'Carnets et documents' },
  { code: 'autre', libelle: 'Autres services' },
]

// --- Tiers payants -----------------------------------------------------------

export const NOM_SEN_CSU = 'SEN-CSU'

export const FAMILLES_TIERS_PAYANTS = [
  {
    kind: 'mutuelle',
    titre: 'Mutuelles de santé',
    ajouter: 'Ajouter une mutuelle',
    exemple: 'Par exemple : Mutuelle de santé de Kolda',
  },
  {
    kind: 'ipm',
    titre: 'IPM',
    ajouter: 'Ajouter une IPM',
    exemple: 'Nom de l’institution de prévoyance maladie',
  },
  {
    kind: 'assurance',
    titre: 'Assurances privées',
    ajouter: 'Ajouter une assurance',
    exemple: 'Nom de la compagnie d’assurance',
  },
]

// --- Horaires d'ouverture ----------------------------------------------------

export const JOURS = [
  { code: 'lundi', libelle: 'Lundi' },
  { code: 'mardi', libelle: 'Mardi' },
  { code: 'mercredi', libelle: 'Mercredi' },
  { code: 'jeudi', libelle: 'Jeudi' },
  { code: 'vendredi', libelle: 'Vendredi' },
  { code: 'samedi', libelle: 'Samedi' },
  { code: 'dimanche', libelle: 'Dimanche' },
]

// statut : 'ferme' | 'ouvert' (de debut à fin) | 'continu' (24 h / 24). Aucune heure supposée.
export function horairesVides() {
  return Object.fromEntries(JOURS.map((j) => [j.code, { statut: 'ferme', debut: '', fin: '' }]))
}

export function lireHoraires(settings) {
  const enregistres = settings?.opening_hours ?? {}
  const vides = horairesVides()
  return Object.fromEntries(
    JOURS.map((j) => [j.code, { ...vides[j.code], ...(enregistres[j.code] ?? {}) }]),
  )
}

// Un jour ouvert demande ses deux heures, différentes l'une de l'autre.
export function validerHoraires(horaires) {
  const erreurs = {}
  for (const { code } of JOURS) {
    const jour = horaires[code]
    if (jour.statut !== 'ouvert') continue
    if (!jour.debut || !jour.fin) erreurs[code] = 'Indiquez l’heure d’ouverture et de fermeture.'
    else if (jour.debut === jour.fin) erreurs[code] = 'Les deux heures doivent être différentes.'
  }
  return erreurs
}

// --- Divers ------------------------------------------------------------------

// Identifiant créé dans le navigateur : un envoi rejoué après une coupure ne crée pas
// de doublon (les fonctions save_* de la base font un « upsert » sur l'id).
export function nouvelId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  const octets = globalThis.crypto.getRandomValues(new Uint8Array(16))
  octets[6] = (octets[6] & 0x0f) | 0x40
  octets[8] = (octets[8] & 0x3f) | 0x80
  const hex = [...octets].map((o) => o.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export function memeTexte(a, b) {
  return a.trim().toLocaleLowerCase('fr') === b.trim().toLocaleLowerCase('fr')
}

export function pluriel(nombre, singulier, plurielForme = `${singulier}s`) {
  return `${nombre} ${nombre > 1 ? plurielForme : singulier}`
}
