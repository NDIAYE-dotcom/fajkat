// Aperçus d'écran des modules (section « Modules par famille »). Données fictives.
// Chaque entrée est soit un fragment du parcours (fragment), soit un aperçu générique
// (icone, titre, precision, lignes, pied). Une entrée peut varier selon l'offre :
// { poste_sante: …, clinique: … }.
// lignes : { libelle, detail?, valeur?, badge?, alerte? } — alerte : badge rouge.

import {
  Activity,
  BadgeCheck,
  Baby,
  BookOpen,
  Building2,
  Calculator,
  CalendarClock,
  CalendarRange,
  ChartNoAxesColumn,
  ClipboardCheck,
  FileChartColumn,
  FileText,
  HandCoins,
  Landmark,
  ListOrdered,
  MessageCircle,
  Pill,
  ScanLine,
  Scissors,
  Send,
  Share2,
  ShieldCheck,
  Siren,
  Stamp,
  Stethoscope,
  Syringe,
  Ticket,
  UsersRound,
  Wallet,
  WifiOff,
} from 'lucide-react'
import { formatFCFA } from '../../../../lib/format.js'

export const APERCUS = {
  // — Parcours du patient —
  patients: {
    icone: UsersRound,
    titre: 'Recherche patient',
    precision: '« Diop »',
    lignes: [
      { libelle: 'Awa Diop', detail: '27 ans · Médina · mère : Fatou Sow', badge: 'Sélectionnée' },
      { libelle: 'Awa Diop', detail: 'âge déclaré ~40 ans · Grand-Yoff · mère : Khady Fall' },
      { libelle: 'Aïssatou Diop', detail: '6 ans · Médina · même téléphone que la famille' },
    ],
  },
  file_attente: {
    poste_sante: { fragment: 'ticket' },
    clinique: {
      icone: ListOrdered,
      titre: 'File d’attente',
      precision: 'Accueil',
      lignes: [
        { libelle: 'A-031', detail: 'Médecine interne · Dr A. Sarr', badge: 'Appelé' },
        {
          libelle: 'A-032',
          detail: 'Pédiatrie · Dr F. Ndiaye',
          badge: 'Prioritaire',
          alerte: true,
        },
        { libelle: 'A-033', detail: 'Gynécologie · Dr M. Fall' },
      ],
    },
  },
  tickets_consultation: {
    icone: Ticket,
    titre: 'Tickets du jour',
    precision: 'Accueil',
    lignes: [
      { libelle: 'Consultation', valeur: '38 tickets' },
      { libelle: 'Consultation prénatale', valeur: '12 tickets' },
      { libelle: 'Vaccination', valeur: '21 tickets' },
    ],
    pied: 'Rattachés à la caisse du jour',
  },
  rendez_vous: {
    icone: CalendarClock,
    titre: 'Rendez-vous de demain',
    lignes: [
      { libelle: 'Awa D.', detail: 'Consultation prénatale', valeur: '08:00' },
      { libelle: 'Bébé Moussa S.', detail: 'Vaccin de 10 semaines', valeur: '08:30' },
      { libelle: 'M. Ba', detail: 'Contrôle de tension', valeur: '09:15' },
    ],
  },
  agenda_multi_praticiens: { fragment: 'agenda' },
  references: {
    icone: Share2,
    titre: 'Fiche de référence',
    lignes: [
      { libelle: 'Patiente', valeur: 'Coumba N., 31 ans' },
      { libelle: 'Vers', valeur: 'Centre de santé' },
      { libelle: 'Motif', valeur: 'Tension mal contrôlée' },
      { libelle: 'Retour', badge: 'Contre-référence reçue' },
    ],
  },
  whatsapp_liens: {
    poste_sante: { fragment: 'whatsapp' },
    clinique: {
      icone: MessageCircle,
      titre: 'Message préparé',
      precision: 'WhatsApp',
      lignes: [
        { libelle: 'Destinataire', valeur: 'M. Diop (famille)' },
        { libelle: 'Modèle', valeur: 'Rappel de rendez-vous' },
        { libelle: 'Langue', valeur: 'Français' },
      ],
      pied: 'Envoyé depuis le téléphone de l’accueil',
    },
  },
  whatsapp_api: {
    icone: Send,
    titre: 'Envois automatiques',
    precision: 'WhatsApp',
    lignes: [
      { libelle: 'Rappels de vaccins', detail: 'la veille, 18:00', badge: 'Programmé' },
      { libelle: 'Rappels de rendez-vous', detail: 'la veille, 18:00', badge: 'Programmé' },
      { libelle: 'Résultats disponibles', detail: 'dès la validation', badge: 'Programmé' },
    ],
  },
  whatsapp_numero_propre: {
    icone: BadgeCheck,
    titre: 'Profil d’envoi',
    precision: 'WhatsApp',
    lignes: [
      { libelle: 'Expéditeur', valeur: 'Numéro de la clinique' },
      { libelle: 'Nom affiché', valeur: 'Nom de la clinique' },
      { libelle: 'Logo', valeur: 'Celui de la clinique' },
    ],
  },
  communautaire: {
    icone: UsersRound,
    titre: 'Activités communautaires',
    precision: 'Cette semaine',
    lignes: [
      { libelle: 'Visite à domicile', detail: 'Ménage Sow · quartier Escale', valeur: 'Lun.' },
      { libelle: 'Causerie', detail: 'Allaitement · 14 participantes', valeur: 'Mer.' },
      { libelle: 'Relais', detail: 'Recherche des perdus de vue', valeur: 'Ven.' },
    ],
  },

  // — Soins et plateau technique —
  consultations: {
    icone: Stethoscope,
    titre: 'Consultation',
    precision: 'Ibrahima F.',
    lignes: [
      { libelle: 'Motif', valeur: 'Fièvre depuis 3 jours' },
      { libelle: 'Température', valeur: '38,6 °C' },
      { libelle: 'TDR paludisme', badge: 'Positif', alerte: true },
      { libelle: 'Traitement', valeur: 'ACT · 3 jours' },
    ],
  },
  maternite: { fragment: 'cpn' },
  vaccination: {
    icone: Syringe,
    titre: 'Carnet de vaccination',
    precision: 'Bébé Moussa S.',
    lignes: [
      { libelle: 'BCG', detail: 'naissance', badge: 'Fait' },
      { libelle: 'Penta 1', detail: '6 semaines', badge: 'Fait' },
      { libelle: 'Penta 2', detail: '10 semaines', badge: 'Demain', alerte: true },
      { libelle: 'Penta 3', detail: '14 semaines', badge: 'À venir' },
    ],
  },
  nutrition_enfant: {
    icone: Baby,
    titre: 'Croissance',
    precision: 'Fatou B., 9 mois',
    lignes: [
      { libelle: 'Poids', valeur: '7,9 kg' },
      { libelle: 'Taille', valeur: '68 cm' },
      { libelle: 'Périmètre brachial', valeur: '13,2 cm' },
      { libelle: 'État nutritionnel', badge: 'Normal' },
    ],
  },
  surveillance_epidemio: {
    icone: Activity,
    titre: 'Surveillance',
    precision: 'Semaine 41',
    lignes: [
      { libelle: 'Paludisme confirmé', valeur: '14 cas' },
      { libelle: 'Diarrhée aiguë', valeur: '6 cas' },
      { libelle: 'Rougeole suspecte', valeur: '1 cas', badge: 'À notifier', alerte: true },
    ],
  },
  hospitalisation: { fragment: 'lit' },
  laboratoire: { fragment: 'labo' },
  imagerie: {
    icone: ScanLine,
    titre: 'Compte rendu d’imagerie',
    lignes: [
      { libelle: 'Patiente', valeur: 'Mme Ba, 29 ans' },
      { libelle: 'Examen', valeur: 'Échographie obstétricale' },
      { libelle: 'Terme estimé', valeur: '22 semaines' },
      { libelle: 'Images jointes', valeur: '4' },
    ],
  },
  urgences: {
    icone: Siren,
    titre: 'Urgences',
    precision: 'Tri',
    lignes: [
      {
        libelle: 'Box 1',
        detail: 'Homme ~45 ans · identité à compléter',
        badge: 'Très urgent',
        alerte: true,
      },
      { libelle: 'Box 2', detail: 'Enfant de 4 ans · fièvre', badge: 'Urgent' },
      { libelle: 'Attente', detail: 'Entorse de la cheville', badge: 'Non urgent' },
    ],
  },
  bloc_operatoire: {
    icone: Scissors,
    titre: 'Programme opératoire',
    precision: 'Mardi',
    lignes: [
      { libelle: '08:00', detail: 'Césarienne programmée · Dr M. Fall', badge: 'En cours' },
      { libelle: '10:30', detail: 'Hernie inguinale · Dr K. Sy' },
      { libelle: '13:00', detail: 'Appendicectomie · Dr K. Sy' },
    ],
  },
  pharmacie: {
    icone: Pill,
    titre: 'Dispensation',
    precision: 'Ordonnance',
    lignes: [
      { libelle: 'Paracétamol 500 mg', detail: '1 comprimé matin, midi et soir', valeur: '× 9' },
      { libelle: 'Amoxicilline 500 mg', detail: '2 gélules matin et soir', valeur: '× 20' },
    ],
    pied: 'Ordonnance d’Ibrahima F. · servie',
  },

  // — Gestion et finances —
  stock: { fragment: 'stock' },
  inventaire_auto: {
    icone: ClipboardCheck,
    titre: 'Inventaire',
    precision: 'Octobre',
    lignes: [
      {
        libelle: 'Paracétamol 500 mg',
        detail: 'théorique 120 · compté 118',
        badge: 'Écart −2',
        alerte: true,
      },
      { libelle: 'Sels de réhydratation', detail: 'théorique 45 · compté 45', badge: 'Conforme' },
      { libelle: 'Gants (boîtes)', detail: 'théorique 12 · compté 12', badge: 'Conforme' },
    ],
  },
  caisse: {
    icone: Wallet,
    titre: 'Clôture de caisse',
    precision: 'Aujourd’hui',
    lignes: [
      { libelle: 'Espèces', valeur: formatFCFA(48500) },
      { libelle: 'Wave', valeur: formatFCFA(21000) },
      { libelle: 'Orange Money', valeur: formatFCFA(9500) },
      { libelle: 'Total du jour', valeur: formatFCFA(79000) },
    ],
    pied: 'Billetage vérifié · caisse clôturée',
  },
  tiers_payants: {
    poste_sante: {
      icone: ShieldCheck,
      titre: 'Prise en charge',
      precision: 'Mutuelle',
      lignes: [
        { libelle: 'Couverture', valeur: 'Mutuelle de santé' },
        { libelle: 'Taux', valeur: '80 %' },
        { libelle: 'Part mutuelle', valeur: formatFCFA(1600) },
        { libelle: 'Part patient', valeur: formatFCFA(400) },
      ],
    },
    clinique: { fragment: 'facture' },
  },
  devis: {
    icone: FileText,
    titre: 'Devis n° 118',
    precision: 'Mme Ba',
    lignes: [
      { libelle: 'Césarienne programmée', valeur: formatFCFA(350000) },
      { libelle: 'Hospitalisation · 3 nuits', valeur: formatFCFA(105000) },
      { libelle: 'Total', valeur: formatFCFA(455000) },
    ],
    pied: 'Envoyé à l’assurance pour accord',
  },
  factures_assurances: {
    icone: Landmark,
    titre: 'Bordereaux',
    precision: 'Octobre',
    lignes: [
      { libelle: 'IPM A', detail: '42 factures', badge: 'Envoyé' },
      { libelle: 'Assurance B', detail: '17 factures', badge: 'Réglé' },
      { libelle: 'Mutuelle C', detail: '3 rejets à corriger', badge: 'Rejets', alerte: true },
    ],
  },
  honoraires: {
    icone: HandCoins,
    titre: 'Honoraires',
    precision: 'Octobre',
    lignes: [
      { libelle: 'Dr A. Sarr', detail: '64 actes', valeur: formatFCFA(640000) },
      { libelle: 'Dr F. Ndiaye', detail: '51 actes', valeur: formatFCFA(510000) },
      { libelle: 'Dr M. Fall', detail: '38 actes', valeur: formatFCFA(570000) },
    ],
  },
  comptabilite: {
    icone: Calculator,
    titre: 'Recettes et dépenses',
    precision: 'Octobre',
    lignes: [
      { libelle: 'Recettes', valeur: formatFCFA(1240000) },
      { libelle: 'Dépenses', valeur: formatFCFA(860000) },
      { libelle: 'Solde', valeur: formatFCFA(380000) },
    ],
  },
  comptabilite_syscohada: {
    icone: BookOpen,
    titre: 'Journal des ventes',
    precision: 'Facture 0347',
    lignes: [
      { libelle: '411 Clients', detail: 'débit', valeur: formatFCFA(68000) },
      { libelle: '706 Services vendus', detail: 'crédit', valeur: formatFCFA(68000) },
    ],
    pied: 'Écriture générée à la facturation',
  },
  personnel: {
    icone: CalendarRange,
    titre: 'Planning de garde',
    precision: 'Cette semaine',
    lignes: [
      { libelle: 'Lundi', detail: 'Infirmier · Ousmane', valeur: 'Nuit' },
      { libelle: 'Mardi', detail: 'Sage-femme · Mariama', valeur: 'Nuit' },
      { libelle: 'Mercredi', detail: 'Infirmière · Ndèye', valeur: 'Nuit' },
    ],
  },
  documents: {
    icone: FileText,
    titre: 'Documents',
    precision: 'Awa D.',
    lignes: [
      { libelle: 'Ordonnance', detail: 'A5', badge: 'Prête' },
      { libelle: 'Certificat médical', detail: 'A4', badge: 'Prêt' },
      { libelle: 'Reçu', detail: 'ticket 80 mm', badge: 'Prêt' },
    ],
  },
  signature_cachet: {
    icone: Stamp,
    titre: 'Certificat médical',
    lignes: [
      { libelle: 'Signature', valeur: 'Apposée' },
      { libelle: 'Cachet', valeur: 'Apposé' },
      { libelle: 'Code de vérification', valeur: 'FJK-7Q2M' },
    ],
  },
  rapports: {
    icone: ChartNoAxesColumn,
    titre: 'Rapport d’activité',
    precision: 'Octobre',
    lignes: [
      { libelle: 'Consultations', valeur: '612' },
      { libelle: 'Consultations prénatales', valeur: '148' },
      { libelle: 'Vaccinations', valeur: '305' },
    ],
  },
  rapports_snis: {
    icone: FileChartColumn,
    titre: 'Rapport mensuel',
    precision: 'District',
    lignes: [
      { libelle: 'Période', valeur: 'Octobre' },
      { libelle: 'Rubriques remplies', valeur: 'depuis les consultations' },
      { libelle: 'État', badge: 'Prêt à transmettre' },
    ],
  },
  gestion_cds: {
    icone: UsersRound,
    titre: 'Comité de santé',
    precision: 'Réunion du 05/10',
    lignes: [
      { libelle: 'Présents', valeur: '9 membres' },
      { libelle: 'Décision', valeur: 'Achat d’un réfrigérateur' },
      { libelle: 'Compte du comité', valeur: formatFCFA(325000) },
    ],
  },
  multi_sites: {
    icone: Building2,
    titre: 'Sites',
    lignes: [
      { libelle: 'Site principal', detail: 'stock et caisse propres', badge: 'Ouvert' },
      { libelle: 'Annexe', detail: 'stock et caisse propres', badge: 'Ouvert' },
    ],
    pied: 'La direction voit l’ensemble',
  },
  hors_ligne: {
    icone: WifiOff,
    titre: 'Hors connexion',
    lignes: [
      {
        libelle: '3 consultations',
        detail: 'enregistrées sur le téléphone',
        badge: 'En attente',
        alerte: true,
      },
      { libelle: 'Réseau retrouvé', detail: 'envoi automatique', badge: 'Synchronisé' },
    ],
  },
}

// Aperçu d'un module pour une offre donnée (null si aucun n'est prévu).
export function apercuModule(code, type) {
  const entree = APERCUS[code]
  if (!entree) return null
  return entree[type] ?? (entree.poste_sante || entree.clinique ? null : entree)
}
