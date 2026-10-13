// Catalogue des modules présentés sur le site public, aligné sur les codes de fonctionnalités
// de CLAUDE.md (section 6). Chaque module appartient à une famille et à une ou deux offres.
// Les modules phares de chaque offre sont désignés dans src/lib/offres.js.

const POSTE = 'poste_sante'
const CLINIQUE = 'clinique'
const LES_DEUX = [POSTE, CLINIQUE]

// Les trois familles du menu « Plateforme », dans l'ordre d'affichage.
export const FAMILLES = [
  {
    id: 'parcours_patient',
    titre: 'Parcours du patient',
    intro: 'De l’arrivée à l’accueil jusqu’au rappel du prochain rendez-vous.',
  },
  {
    id: 'soins_plateau',
    titre: 'Soins et plateau technique',
    intro: 'Consultations, suivi mère-enfant, examens et médicaments.',
  },
  {
    id: 'gestion_finances',
    titre: 'Gestion et finances',
    intro: 'Stock, caisse, équipe et rapports, tenus au fil de l’activité.',
  },
]

// variantes : titre ou description propres à une offre, quand le module n'y joue pas le même rôle.
// reserve : condition affichée telle quelle sous la description.
export const MODULES = [
  // — Parcours du patient —
  {
    code: 'patients',
    famille: 'parcours_patient',
    offres: LES_DEUX,
    titre: 'Patients et ménages',
    titreCourt: 'Dossiers patients',
    description:
      'Un dossier par personne, même quand toute la famille partage un numéro. Recherche par nom, téléphone, quartier et prénom de la mère, « âge déclaré » accepté.',
    variantes: {
      [CLINIQUE]: {
        titre: 'Dossiers patients centralisés',
        description:
          'Un seul dossier par patient, partagé entre les services, avec une recherche qui distingue les homonymes.',
      },
    },
  },
  {
    code: 'file_attente',
    famille: 'parcours_patient',
    offres: LES_DEUX,
    titre: 'File d’attente',
    titreCourt: 'File d’attente',
    description:
      'Ordre d’arrivée et priorité aux femmes enceintes, aux enfants de moins de 5 ans et aux personnes âgées. Ticket de passage imprimé en 80 mm.',
  },
  {
    code: 'tickets_consultation',
    famille: 'parcours_patient',
    offres: [POSTE],
    titre: 'Tickets de consultation',
    titreCourt: 'Tickets de consultation',
    description:
      'Le ticket vendu à l’accueil, numéroté et rattaché à la caisse, selon les tarifs fixés par le comité de santé.',
  },
  {
    code: 'rendez_vous',
    famille: 'parcours_patient',
    offres: LES_DEUX,
    titre: 'Rendez-vous',
    titreCourt: 'Rendez-vous',
    description:
      'Prochaine CPN, prochain vaccin, contrôle : chaque rendez-vous est noté dans le dossier et visible le jour venu.',
  },
  {
    code: 'agenda_multi_praticiens',
    famille: 'parcours_patient',
    offres: [CLINIQUE],
    titre: 'Agenda par praticien',
    titreCourt: 'Agenda multi-praticiens',
    description:
      'Un agenda par praticien, des créneaux par spécialité, et l’accueil qui voit les disponibilités d’un coup d’œil.',
  },
  {
    code: 'references',
    famille: 'parcours_patient',
    offres: LES_DEUX,
    titre: 'Références et contre-références',
    titreCourt: 'Références',
    description:
      'La fiche de référence vers le centre de santé ou l’hôpital, et le retour d’information quand le patient revient.',
  },
  {
    code: 'whatsapp_liens',
    famille: 'parcours_patient',
    offres: LES_DEUX,
    titre: 'Rappels par WhatsApp',
    titreCourt: 'Rappels WhatsApp',
    description:
      'Le message de rappel est préparé, en français ou en wolof ; il part depuis le téléphone de la structure, au patient ou à sa famille.',
  },
  {
    code: 'whatsapp_api',
    famille: 'parcours_patient',
    offres: LES_DEUX,
    titre: 'Envois WhatsApp automatiques',
    titreCourt: 'WhatsApp automatique',
    description:
      'Les rappels de rendez-vous et de vaccins partent seuls, la veille, sans action de l’équipe.',
    reserve: 'Sous réserve de configuration de WhatsApp.',
  },
  {
    code: 'whatsapp_numero_propre',
    famille: 'parcours_patient',
    offres: [CLINIQUE],
    titre: 'WhatsApp au numéro de la clinique',
    titreCourt: 'Numéro WhatsApp propre',
    description:
      'Les messages aux patients partent du numéro et au nom de la clinique, avec son logo.',
    reserve: 'Sous réserve de validation du numéro par WhatsApp.',
  },
  {
    code: 'communautaire',
    famille: 'parcours_patient',
    offres: [POSTE],
    titre: 'Activités communautaires',
    titreCourt: 'Communautaire',
    description:
      'Visites à domicile, causeries et relais communautaires : les activités hors du poste sont notées et rattachées aux ménages.',
  },

  // — Soins et plateau technique —
  {
    code: 'consultations',
    famille: 'soins_plateau',
    offres: LES_DEUX,
    titre: 'Consultations et soins',
    titreCourt: 'Consultations',
    description:
      'Motif, examen, diagnostic et traitement en quelques champs, avec l’historique du patient sous les yeux.',
  },
  {
    code: 'maternite',
    famille: 'soins_plateau',
    offres: LES_DEUX,
    titre: 'Grossesse et parcours mère-enfant',
    titreCourt: 'Maternité',
    description:
      'Consultations prénatales, accouchement, suivi post-natal et planification familiale.',
  },
  {
    code: 'vaccination',
    famille: 'soins_plateau',
    offres: LES_DEUX,
    titre: 'Vaccination',
    titreCourt: 'Vaccination',
    description:
      'Calendrier vaccinal configurable : quand le calendrier national change, il se met à jour sans nouvelle version du logiciel.',
  },
  {
    code: 'nutrition_enfant',
    famille: 'soins_plateau',
    offres: LES_DEUX,
    titre: 'Croissance et nutrition de l’enfant',
    titreCourt: 'Nutrition de l’enfant',
    description:
      'Poids, taille et périmètre brachial à chaque visite, avec la courbe de croissance et le signalement de la malnutrition.',
  },
  {
    code: 'surveillance_epidemio',
    famille: 'soins_plateau',
    offres: LES_DEUX,
    titre: 'Surveillance épidémiologique',
    titreCourt: 'Surveillance épidémio',
    description:
      'Les maladies à déclaration obligatoire repérées dès la consultation, et le décompte hebdomadaire préparé.',
  },
  {
    code: 'hospitalisation',
    famille: 'soins_plateau',
    offres: [CLINIQUE],
    titre: 'Hospitalisation',
    titreCourt: 'Hospitalisation',
    description:
      'Plan des lits, admissions, feuille de soins infirmiers et sortie, avec la facture du séjour qui se prépare au fil des jours.',
  },
  {
    code: 'laboratoire',
    famille: 'soins_plateau',
    offres: [CLINIQUE],
    titre: 'Laboratoire',
    titreCourt: 'Laboratoire',
    description:
      'Demande d’examen depuis la consultation, saisie et validation des résultats, retour automatique dans le dossier.',
  },
  {
    code: 'imagerie',
    famille: 'soins_plateau',
    offres: [CLINIQUE],
    titre: 'Imagerie',
    titreCourt: 'Imagerie',
    description:
      'Demandes d’échographie ou de radiographie, comptes rendus et images jointes au dossier du patient.',
  },
  {
    code: 'urgences',
    famille: 'soins_plateau',
    offres: [CLINIQUE],
    titre: 'Urgences',
    titreCourt: 'Urgences',
    description:
      'Admission rapide, même sans identité complète, tri par niveau de gravité et suivi jusqu’à l’orientation du patient.',
  },
  {
    code: 'bloc_operatoire',
    famille: 'soins_plateau',
    offres: [CLINIQUE],
    titre: 'Bloc opératoire',
    titreCourt: 'Bloc opératoire',
    description:
      'Programme opératoire, équipe, consommables utilisés et compte rendu d’intervention.',
  },
  {
    code: 'pharmacie',
    famille: 'soins_plateau',
    offres: LES_DEUX,
    titre: 'Dépôt de médicaments et dispensation',
    titreCourt: 'Pharmacie',
    description: 'Dispensation reliée à l’ordonnance, chaque sortie est tracée.',
    variantes: {
      [CLINIQUE]: {
        titre: 'Pharmacie de la clinique',
        description:
          'Dispensation reliée à l’ordonnance et au service, chaque sortie est tracée et facturée.',
      },
    },
  },

  // — Gestion et finances —
  {
    code: 'stock',
    famille: 'gestion_finances',
    offres: LES_DEUX,
    titre: 'Stock, lots et péremptions',
    titreCourt: 'Stock',
    description:
      'Entrées par lot, seuils de réapprovisionnement et dates de péremption signalées avant qu’il ne soit trop tard.',
  },
  {
    code: 'inventaire_auto',
    famille: 'gestion_finances',
    offres: LES_DEUX,
    titre: 'Inventaire guidé',
    titreCourt: 'Inventaire',
    description:
      'Le stock théorique est proposé ligne par ligne : il reste à compter, et les écarts sont expliqués.',
  },
  {
    code: 'caisse',
    famille: 'gestion_finances',
    offres: LES_DEUX,
    titre: 'Caisse, recettes et dépenses',
    titreCourt: 'Caisse',
    description:
      'Espèces, Wave, Orange Money ou Free Money, et une clôture de caisse avec billetage en fin de journée.',
    variantes: {
      [CLINIQUE]: {
        titre: 'Facturation, paiements et caisse',
        description:
          'Factures par acte, encaissements en espèces ou mobile money, clôture de caisse par caissier.',
      },
    },
  },
  {
    code: 'tiers_payants',
    famille: 'gestion_finances',
    offres: LES_DEUX,
    titre: 'Tiers payants',
    titreCourt: 'Tiers payants',
    description:
      'SEN-CSU, mutuelles, IPM et assurances : la part prise en charge et la part du patient calculées à l’encaissement.',
  },
  {
    code: 'devis',
    famille: 'gestion_finances',
    offres: [CLINIQUE],
    titre: 'Devis',
    titreCourt: 'Devis',
    description:
      'Un devis pour une intervention ou un séjour, remis au patient ou à son assurance, puis transformé en facture.',
  },
  {
    code: 'factures_assurances',
    famille: 'gestion_finances',
    offres: [CLINIQUE],
    titre: 'Factures aux assurances',
    titreCourt: 'Factures assurances',
    description: 'Bordereaux par assureur et par période, suivi des règlements et des rejets.',
  },
  {
    code: 'honoraires',
    famille: 'gestion_finances',
    offres: [CLINIQUE],
    titre: 'Honoraires des praticiens',
    titreCourt: 'Honoraires',
    description:
      'La part de chaque praticien calculée sur les actes réalisés, selon les règles fixées par la clinique.',
  },
  {
    code: 'comptabilite',
    famille: 'gestion_finances',
    offres: LES_DEUX,
    titre: 'Comptabilité de gestion',
    titreCourt: 'Comptabilité',
    description: 'Recettes, dépenses et états de gestion par période.',
  },
  {
    code: 'comptabilite_syscohada',
    famille: 'gestion_finances',
    offres: [CLINIQUE],
    titre: 'Comptabilité SYSCOHADA',
    titreCourt: 'SYSCOHADA',
    description:
      'Écritures générées à partir de l’activité, plan comptable SYSCOHADA et export pour l’expert-comptable.',
  },
  {
    code: 'personnel',
    famille: 'gestion_finances',
    offres: LES_DEUX,
    titre: 'Personnel et plannings',
    titreCourt: 'Personnel',
    description: 'Gardes, présences et répartition des tâches de l’équipe.',
  },
  {
    code: 'documents',
    famille: 'gestion_finances',
    offres: LES_DEUX,
    titre: 'Documents imprimables',
    titreCourt: 'Documents',
    description:
      'Ordonnances, certificats et reçus à l’en-tête de la structure, en A4, A5 ou ticket 80 mm.',
  },
  {
    code: 'signature_cachet',
    famille: 'gestion_finances',
    offres: LES_DEUX,
    titre: 'Signature et cachet',
    titreCourt: 'Signature et cachet',
    description:
      'La signature et le cachet du praticien apposés sur les documents, avec un code de vérification.',
  },
  {
    code: 'rapports',
    famille: 'gestion_finances',
    offres: LES_DEUX,
    titre: 'Rapports d’activité',
    titreCourt: 'Rapports',
    description: 'Les chiffres du mois préparés à partir des données saisies au quotidien.',
  },
  {
    code: 'rapports_snis',
    famille: 'gestion_finances',
    offres: [POSTE],
    titre: 'Rapports SNIS',
    titreCourt: 'Rapports SNIS',
    description:
      'Les données mensuelles demandées par le district, préparées à partir des consultations saisies.',
  },
  {
    code: 'gestion_cds',
    famille: 'gestion_finances',
    offres: [POSTE],
    titre: 'Gestion du comité de santé',
    titreCourt: 'Comité de santé',
    description:
      'Réunions, décisions, tarifs et comptes du comité de développement sanitaire, présentés clairement.',
  },
  {
    code: 'multi_sites',
    famille: 'gestion_finances',
    offres: [CLINIQUE],
    titre: 'Plusieurs sites',
    titreCourt: 'Multi-sites',
    description:
      'Plusieurs adresses sous une même clinique : chaque site a son stock et sa caisse, la direction voit l’ensemble.',
  },
  {
    code: 'hors_ligne',
    famille: 'gestion_finances',
    offres: LES_DEUX,
    titre: 'Travail hors connexion',
    titreCourt: 'Hors connexion',
    description:
      'Les écrans essentiels restent utilisables pendant une coupure ; les saisies partent dès le retour du réseau.',
  },
]
