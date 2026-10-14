// Navigation de l'application connectée (/app) : configuration unique, lue par le menu
// latéral, la barre mobile, le tiroir « Plus », les gardes de route et le tableau de bord.
//
// Une entrée n'apparaît que si la structure a la fonctionnalité (useFeature) ET si le rôle
// de l'utilisateur figure dans « roles ». Le contrôle qui fait foi reste celui des policies
// RLS côté base : ici, on ne fait que masquer.
//
// Champs d'une entrée :
//   code        identifiant stable de l'entrée
//   chemin      segment sous /app ('' pour la Journée du jour)
//   libelle     texte du menu ; libelleCourt : barre mobile (6 cases à 360 px)
//   icone       composant lucide-react, affiché via <Icone>
//   feature     code de fonctionnalité requis (null : toujours inclus)
//   roles       rôles autorisés (memberships.role)
//   famille     famille du menu (FAMILLES_NAV)
//   mobile      rang dans la barre inférieure (1 à 5), absent sinon
//   description phrase affichée tant que le module est en préparation (sinon, celle du catalogue)

import {
  Activity,
  Baby,
  BedDouble,
  BookOpen,
  CalendarClock,
  CalendarDays,
  ChartColumn,
  FileText,
  FlaskConical,
  HeartPulse,
  Landmark,
  ListOrdered,
  MapPin,
  MessageCircle,
  Package,
  Pill,
  ScanLine,
  Scissors,
  Send,
  ShieldCheck,
  Siren,
  Stethoscope,
  Ticket,
  UserCog,
  Users,
  Wallet,
} from 'lucide-react'
import { MODULES } from '../lib/modules.js'
import { getOffre } from '../lib/offres.js'

// --- Rôles -------------------------------------------------------------------

export const ROLES = {
  owner: 'Propriétaire',
  admin: 'Administrateur',
  medecin: 'Médecin',
  sage_femme: 'Sage-femme',
  infirmier: 'Infirmier',
  aide_soignant: 'Aide-soignant',
  pharmacien: 'Pharmacien',
  caissier: 'Caissier',
  comptable: 'Comptable',
  accueil: 'Accueil',
  laborantin: 'Laborantin',
  agent_communautaire: 'Agent communautaire',
}

export const TOUS_LES_ROLES = Object.keys(ROLES)

const DIRECTION = ['owner', 'admin']
// Secret médical : jamais la caisse, la comptabilité ni l'accueil.
const SOIGNANTS = [...DIRECTION, 'medecin', 'sage_femme', 'infirmier', 'aide_soignant']
// Accueil des patients : identité, file d'attente, rendez-vous.
const ACCUEIL = [...SOIGNANTS, 'accueil']
const FINANCES = [...DIRECTION, 'caissier', 'comptable']
const MEDICAMENTS = [...DIRECTION, 'pharmacien', 'infirmier']

// Pages du menu utilisateur, hors familles.
export const ROLES_PARAMETRES = DIRECTION
export const ROLES_ABONNEMENT = DIRECTION

// --- Familles ----------------------------------------------------------------

export const FAMILLES_NAV = [
  { id: 'parcours_patient', titre: 'Parcours du patient' },
  { id: 'soins_plateau', titre: 'Soins et plateau technique' },
  { id: 'gestion_finances', titre: 'Gestion et finances' },
]

// --- Entrées -----------------------------------------------------------------

export const ENTREES = [
  // — Parcours du patient —
  {
    code: 'journee',
    chemin: '',
    libelle: 'Journée du jour',
    libelleCourt: 'Journée',
    icone: CalendarDays,
    feature: null,
    roles: TOUS_LES_ROLES,
    famille: 'parcours_patient',
    mobile: 1,
  },
  {
    code: 'patients',
    chemin: 'patients',
    libelle: 'Patients',
    icone: Users,
    feature: 'patients',
    // Caissier, pharmacien et laborantin : identité seulement, pour retrouver le bon dossier.
    roles: [...ACCUEIL, 'caissier', 'pharmacien', 'laborantin'],
    famille: 'parcours_patient',
    mobile: 2,
  },
  {
    code: 'file_attente',
    chemin: 'file-attente',
    libelle: 'File d’attente',
    libelleCourt: 'File',
    icone: ListOrdered,
    feature: 'file_attente',
    roles: ACCUEIL,
    famille: 'parcours_patient',
    mobile: 3,
  },
  {
    code: 'tickets_consultation',
    chemin: 'tickets',
    libelle: 'Tickets de consultation',
    icone: Ticket,
    feature: 'tickets_consultation',
    roles: [...DIRECTION, 'accueil', 'caissier', 'infirmier'],
    famille: 'parcours_patient',
  },
  {
    code: 'rendez_vous',
    chemin: 'rendez-vous',
    libelle: 'Rendez-vous',
    icone: CalendarClock,
    feature: 'rendez_vous',
    roles: ACCUEIL,
    famille: 'parcours_patient',
  },
  {
    code: 'urgences',
    chemin: 'urgences',
    libelle: 'Urgences',
    icone: Siren,
    feature: 'urgences',
    roles: SOIGNANTS,
    famille: 'parcours_patient',
  },
  {
    code: 'references',
    chemin: 'references',
    libelle: 'Références',
    icone: Send,
    feature: 'references',
    roles: SOIGNANTS,
    famille: 'parcours_patient',
  },
  {
    code: 'whatsapp',
    chemin: 'whatsapp',
    libelle: 'WhatsApp',
    icone: MessageCircle,
    feature: 'whatsapp_liens',
    roles: ACCUEIL,
    famille: 'parcours_patient',
  },

  // — Soins et plateau technique —
  {
    code: 'consultations',
    chemin: 'consultations',
    libelle: 'Consultations',
    libelleCourt: 'Consult.',
    icone: Stethoscope,
    feature: 'consultations',
    roles: SOIGNANTS,
    famille: 'soins_plateau',
    mobile: 4,
  },
  {
    code: 'maternite',
    chemin: 'maternite',
    libelle: 'Maternité',
    icone: HeartPulse,
    feature: 'maternite',
    roles: SOIGNANTS,
    famille: 'soins_plateau',
  },
  {
    code: 'enfant',
    chemin: 'enfant',
    libelle: 'Santé de l’enfant',
    icone: Baby,
    feature: 'vaccination',
    roles: SOIGNANTS,
    famille: 'soins_plateau',
    description:
      'Vaccination selon le calendrier en vigueur, courbes de croissance et suivi nutritionnel des enfants de moins de 5 ans.',
  },
  {
    code: 'hospitalisation',
    chemin: 'hospitalisation',
    libelle: 'Hospitalisation',
    icone: BedDouble,
    feature: 'hospitalisation',
    roles: SOIGNANTS,
    famille: 'soins_plateau',
  },
  {
    code: 'laboratoire',
    chemin: 'laboratoire',
    libelle: 'Laboratoire',
    icone: FlaskConical,
    feature: 'laboratoire',
    roles: [...SOIGNANTS, 'laborantin'],
    famille: 'soins_plateau',
  },
  {
    code: 'imagerie',
    chemin: 'imagerie',
    libelle: 'Imagerie',
    icone: ScanLine,
    feature: 'imagerie',
    roles: SOIGNANTS,
    famille: 'soins_plateau',
  },
  {
    code: 'bloc_operatoire',
    chemin: 'bloc',
    libelle: 'Bloc opératoire',
    icone: Scissors,
    feature: 'bloc_operatoire',
    roles: SOIGNANTS,
    famille: 'soins_plateau',
  },
  {
    code: 'pharmacie',
    chemin: 'pharmacie',
    libelle: 'Pharmacie',
    icone: Pill,
    feature: 'pharmacie',
    roles: MEDICAMENTS,
    famille: 'soins_plateau',
  },
  {
    code: 'communautaire',
    chemin: 'communautaire',
    libelle: 'Communautaire',
    icone: MapPin,
    feature: 'communautaire',
    roles: [...DIRECTION, 'infirmier', 'sage_femme', 'agent_communautaire'],
    famille: 'soins_plateau',
  },
  {
    code: 'surveillance_epidemio',
    chemin: 'surveillance',
    libelle: 'Surveillance épidémiologique',
    icone: Activity,
    feature: 'surveillance_epidemio',
    roles: [...DIRECTION, 'medecin', 'sage_femme', 'infirmier'],
    famille: 'soins_plateau',
  },

  // — Gestion et finances —
  {
    code: 'caisse',
    chemin: 'caisse',
    libelle: 'Caisse',
    icone: Wallet,
    feature: 'caisse',
    roles: FINANCES,
    famille: 'gestion_finances',
    mobile: 5,
  },
  {
    code: 'tiers_payants',
    chemin: 'tiers-payants',
    libelle: 'Tiers payants',
    icone: ShieldCheck,
    feature: 'tiers_payants',
    roles: FINANCES,
    famille: 'gestion_finances',
  },
  {
    code: 'stock',
    chemin: 'stock',
    libelle: 'Stock',
    icone: Package,
    feature: 'stock',
    roles: MEDICAMENTS,
    famille: 'gestion_finances',
  },
  {
    code: 'comptabilite',
    chemin: 'comptabilite',
    libelle: 'Comptabilité',
    icone: BookOpen,
    feature: 'comptabilite',
    roles: [...DIRECTION, 'comptable'],
    famille: 'gestion_finances',
  },
  {
    code: 'documents',
    chemin: 'documents',
    libelle: 'Documents',
    icone: FileText,
    feature: 'documents',
    roles: SOIGNANTS,
    famille: 'gestion_finances',
  },
  {
    code: 'personnel',
    chemin: 'personnel',
    libelle: 'Personnel',
    icone: UserCog,
    feature: 'personnel',
    roles: DIRECTION,
    famille: 'gestion_finances',
  },
  {
    code: 'rapports',
    chemin: 'rapports',
    libelle: 'Rapports',
    icone: ChartColumn,
    feature: 'rapports',
    roles: [...DIRECTION, 'medecin', 'sage_femme', 'infirmier'],
    famille: 'gestion_finances',
  },
  {
    code: 'gestion_cds',
    chemin: 'comite-de-sante',
    libelle: 'Comité de santé',
    icone: Landmark,
    feature: 'gestion_cds',
    roles: [...DIRECTION, 'comptable'],
    famille: 'gestion_finances',
  },
]

// --- Fonctions ---------------------------------------------------------------

export function lienEntree(entree) {
  return entree.chemin ? `/app/${entree.chemin}` : '/app'
}

// Entrée correspondant au premier segment après /app (« caisse » pour /app/caisse/jour).
export function entreeDepuisChemin(chemin) {
  const segment = chemin.replace(/^\/app\/?/, '').split('/')[0]
  return ENTREES.find((e) => e.chemin === segment) ?? null
}

export function roleAutorise(entree, role) {
  return Boolean(role) && entree.roles.includes(role)
}

export function featureIncluse(entree, features) {
  return !entree.feature || features.includes(entree.feature)
}

// Entrées visibles : fonctionnalité incluse ET rôle autorisé.
export function entreesVisibles(features, role) {
  return ENTREES.filter((e) => featureIncluse(e, features) && roleAutorise(e, role))
}

export function grouperParFamille(entrees) {
  return FAMILLES_NAV.map((famille) => ({
    ...famille,
    entrees: entrees.filter((e) => e.famille === famille.id),
  })).filter((famille) => famille.entrees.length > 0)
}

// Barre mobile : les entrées prévues (rang 1 à 5) que le rôle autorise, complétées
// par les suivantes du menu pour toujours proposer 5 cases.
export const TAILLE_BARRE_MOBILE = 5

export function entreesBarreMobile(visibles) {
  const prevues = visibles.filter((e) => e.mobile).sort((a, b) => a.mobile - b.mobile)
  const completes = visibles.filter((e) => !e.mobile)
  return [...prevues, ...completes].slice(0, TAILLE_BARRE_MOBILE)
}

// Texte du catalogue (src/lib/modules.js), avec la variante propre à l'offre de la structure.
function moduleDuCatalogue(code, type) {
  const deLOffre = getOffre(type)?.fonctionnalites.find((m) => m.code === code)
  return deLOffre ?? MODULES.find((m) => m.code === code) ?? null
}

export function descriptionEntree(entree, type) {
  return entree.description ?? moduleDuCatalogue(entree.feature, type)?.description ?? ''
}

// Offres qui incluent la fonctionnalité de l'entrée : ['clinique'], ['poste_sante'] ou les deux.
export function offresDeLEntree(entree) {
  if (!entree.feature) return ['poste_sante', 'clinique']
  return MODULES.find((m) => m.code === entree.feature)?.offres ?? []
}
