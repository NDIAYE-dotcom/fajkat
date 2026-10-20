// Dossier médical (sans affichage) : catégories d'antécédents, contrôles de la saisie,
// libellés de la chronologie.
import { ETAPES } from '../accueil/utils.js'
import { STATUTS_RDV } from '../rendez-vous/agenda.js'

export const CATEGORIES = [
  { code: 'medical', libelle: 'Médicaux' },
  { code: 'surgical', libelle: 'Chirurgicaux' },
  { code: 'obstetric', libelle: 'Gynéco-obstétricaux' },
  { code: 'family', libelle: 'Familiaux' },
  { code: 'lifestyle', libelle: 'Mode de vie' },
]

// Exemples sous la case, par catégorie : situations courantes, pas une liste fermée.
export const EXEMPLES = {
  medical: 'Exemple : drépanocytose, hypertension, asthme',
  surgical: 'Exemple : césarienne en 2021, appendicectomie',
  obstetric: 'Exemple : G3 P2, fausse couche en 2020',
  family: 'Exemple : diabète chez la mère',
  lifestyle: 'Exemple : tabac, 10 cigarettes par jour',
}

export const LIBELLE_MAX = 200
export const DETAILS_MAX = 1000

export const ANTECEDENT_VIDE = {
  category: 'medical',
  label: '',
  details: '',
  annee: '',
  is_sensitive: false,
}

// Contrôles de la saisie, avec les mêmes règles que la base : { erreurs, valeur }.
// annee : texte saisi (« 2019 »), vide accepté.
export function verifierAntecedent(saisie, anneeCourante = new Date().getFullYear()) {
  const erreurs = {}
  const label = saisie.label.trim()
  if (label.length < 2) erreurs.label = 'Écrivez l’antécédent (2 caractères au moins).'
  const annee = String(saisie.annee ?? '').trim()
  let since = null
  if (annee) {
    if (!/^\d{4}$/.test(annee)) {
      erreurs.annee = 'Écrivez l’année sur 4 chiffres, par exemple 2019.'
    } else if (Number(annee) < 1900 || Number(annee) > anneeCourante) {
      erreurs.annee = `Année : entre 1900 et ${anneeCourante}.`
    } else {
      since = Number(annee)
    }
  }
  return {
    erreurs,
    valeur: {
      id: saisie.id,
      category: saisie.category,
      label,
      details: saisie.details.trim(),
      since_year: since,
      is_sensitive: Boolean(saisie.is_sensitive),
    },
  }
}

export const saisieAntecedent = (a) => ({
  id: a.id,
  category: a.category,
  label: a.label ?? '',
  details: a.details ?? '',
  annee: a.since_year ? String(a.since_year) : '',
  is_sensitive: Boolean(a.is_sensitive),
})

// --- Chronologie --------------------------------------------------------------------------

// Filtres proposés : les rôles non médicaux ne reçoivent de toute façon que les passages et
// les rendez-vous (la base décide), on ne leur propose donc que ceux-là.
export function filtresChronologie(medical) {
  const communs = [
    { id: 'tout', libelle: 'Tout', types: null },
    { id: 'rendez-vous', libelle: 'Rendez-vous', types: ['appointment'] },
    { id: 'passages', libelle: 'Passages', types: ['visit'] },
  ]
  if (!medical) return communs
  return [
    communs[0],
    { id: 'consultations', libelle: 'Consultations', types: ['encounter'] },
    communs[1],
    communs[2],
    { id: 'ordonnances', libelle: 'Ordonnances', types: ['prescription'] },
    { id: 'references', libelle: 'Références', types: ['referral'] },
    { id: 'certificats', libelle: 'Certificats', types: ['certificate'] },
  ]
}

export const GENRES = {
  visit: 'Passage',
  appointment: 'Rendez-vous',
  encounter: 'Consultation',
  prescription: 'Ordonnance',
  referral: 'Référence',
  certificate: 'Certificat',
}

// Statut affiché d'une ligne : { libelle, ton } ou null.
export function statutLigne(l) {
  if (l.kind === 'visit') {
    // Passage oublié un jour passé, clos par la base : ni « Terminé » ni « Parti sans être vu ».
    if (l.status === 'closed_auto') return { libelle: 'Clos automatiquement', ton: 'neutre' }
    return ETAPES[l.status] ? { libelle: ETAPES[l.status], ton: 'neutre' } : null
  }
  if (l.kind === 'appointment') return STATUTS_RDV[l.status] ?? null
  if (l.kind === 'encounter') {
    return l.status === 'validated'
      ? { libelle: 'Validée', ton: 'primaire' }
      : { libelle: 'Non validée', ton: 'alerte' }
  }
  if (l.kind === 'referral') {
    // Contre-référence reçue : écrite dans le détail de la ligne.
    return l.status === 'sent' ? { libelle: 'Envoyée', ton: 'encre' } : null
  }
  return null
}
