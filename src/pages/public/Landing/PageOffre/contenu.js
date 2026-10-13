// Textes de la page de chaque offre : héros, parcours du patient fictif, atouts.
// Les prix ne sont pas ici : ils viennent de src/lib/offres.js.
// Toutes les données des parcours sont fictives et présentées comme telles.

import { Printer, Smartphone, WifiOff } from 'lucide-react'

export const CONTENU_OFFRES = {
  poste_sante: {
    heros: {
      surtitre: 'Offre Poste de santé',
      titre: 'Tout le poste de santé, tenu dans un seul registre.',
      chapeau:
        'Accueil, consultations, vaccination, dépôt et caisse : l’ICP, la sage-femme et toute l’équipe travaillent sur les mêmes informations, même quand la connexion faiblit.',
      image: '/images/poste-sante.webp',
      vignettes: [
        { cle: 'ticket', titre: 'Ticket A-012', detail: 'CPN · prioritaire' },
        { cle: 'rappel', titre: 'Rappel envoyé', detail: 'WhatsApp · maman d’Awa' },
        { cle: 'paiement', titre: 'Paiement reçu', detail: '800 FCFA · Wave' },
      ],
    },
    parcours: {
      titre: 'Le parcours d’Awa',
      intro:
        'Awa est enceinte de six mois. Suivez sa matinée au poste de santé, de l’accueil jusqu’au rappel de son prochain rendez-vous.',
      etapes: [
        {
          moment: '07:52 · Accueil',
          titre: 'Un ticket, et sa priorité',
          texte:
            'À son arrivée, Awa reçoit son ticket de passage. Enceinte, elle est signalée prioritaire : l’accueil n’a rien à retenir de tête.',
          fragment: 'ticket',
        },
        {
          moment: '08:15 · Consultation prénatale',
          titre: 'La fiche CPN se remplit',
          texte:
            'La sage-femme retrouve le dossier d’Awa malgré les homonymes. Tension, poids, hauteur utérine : la fiche se complète, le prochain rendez-vous est fixé.',
          fragment: 'cpn',
        },
        {
          moment: '08:40 · Dépôt',
          titre: 'Le stock se met à jour',
          texte:
            'Au dépôt, la boîte de fer et acide folique prescrite sort du stock. Le compte passe de 24 à 23 boîtes, sans cahier à corriger le soir.',
          fragment: 'stock',
        },
        {
          moment: '08:45 · Caisse',
          titre: 'Un reçu, payé par Wave',
          texte:
            'Awa règle par Wave. Le reçu s’imprime sur ticket 80 mm et la recette entre directement dans la caisse du jour.',
          fragment: 'recu',
        },
        {
          moment: 'La veille du rendez-vous',
          titre: 'Le rappel arrive sur WhatsApp',
          texte:
            'Un mois plus tard, la veille de sa prochaine CPN, Awa reçoit un rappel sur le téléphone de la famille.',
          fragment: 'whatsapp',
        },
      ],
    },
    atouts: {
      titre: 'Pensé pour les conditions du terrain',
      elements: [
        {
          icone: WifiOff,
          titre: 'Connexion instable',
          texte:
            'Les saisies longues sont conservées en brouillon. Un mode hors connexion est prévu pour les écrans essentiels.',
        },
        {
          icone: Smartphone,
          titre: 'Téléphones modestes',
          texte:
            'Des pages légères, lisibles en plein soleil et utilisables sur un petit écran Android.',
        },
        {
          icone: Printer,
          titre: 'Impression au poste',
          texte: 'Documents en A4 ou A5, reçus et tickets de passage au format thermique 80 mm.',
        },
      ],
    },
    appelFinal: 'Préparez l’inscription de votre poste de santé.',
    questionAutre: 'Vous gérez plutôt une clinique ?',
    notesTarif: [
      'Règlement mensuel prévu par Wave, Orange Money, Free Money ou carte.',
      'Passage ultérieur à l’offre Clinique sans perte de données.',
    ],
  },

  clinique: {
    heros: {
      surtitre: 'Offre Clinique',
      titre: 'Plusieurs services, un seul dossier patient.',
      chapeau:
        'De l’accueil à la facturation, Fajkat relie les praticiens, les services et l’administration de votre clinique, sans ressaisie d’un bureau à l’autre.',
      image: '/images/clinique.webp',
      vignettes: [
        { cle: 'lit', titre: 'Chambre 2 attribuée', detail: 'M. Diop · médecine' },
        { cle: 'labo', titre: 'Résultat de labo validé', detail: 'NFS · transmis au médecin' },
        { cle: 'prise', titre: 'Prise en charge', detail: 'IPM · 80 %' },
      ],
    },
    parcours: {
      titre: 'Le parcours de M. Diop',
      intro:
        'M. Diop, 58 ans, consulte pour une fatigue persistante. Suivez son passage dans la clinique, du rendez-vous à la facture.',
      etapes: [
        {
          moment: 'Lundi · Rendez-vous',
          titre: 'Le bon praticien, le bon créneau',
          texte:
            'L’accueil voit d’un coup d’œil les agendas des praticiens et place M. Diop à 09:30 avec le médecin interniste.',
          fragment: 'agenda',
        },
        {
          moment: '09:50 · Consultation',
          titre: 'Les examens demandés en un geste',
          texte:
            'Le médecin coche les examens depuis la consultation. Le laboratoire reçoit la demande, sans bon papier à transmettre.',
          fragment: 'examen',
        },
        {
          moment: '11:20 · Hospitalisation',
          titre: 'Un lit attribué sur le plan',
          texte:
            'Le médecin décide une surveillance. Le plan des lits montre une chambre libre : M. Diop y est admis, le service le voit aussitôt.',
          fragment: 'lit',
        },
        {
          moment: '14:05 · Laboratoire',
          titre: 'Le résultat revient dans le dossier',
          texte:
            'Le biologiste valide la NFS. Le résultat apparaît dans le dossier de M. Diop et le médecin en est averti.',
          fragment: 'labo',
        },
        {
          moment: 'Sortie · Facturation',
          titre: 'Part assurance, part patient',
          texte:
            'À la sortie, la facture sépare la part prise en charge par l’IPM et la part du patient. M. Diop règle sa part, le reçu est tamponné.',
          fragment: 'facture',
        },
      ],
    },
    atouts: {
      titre: 'Chacun retrouve ce qui le concerne',
      elements: [
        {
          titre: 'Direction',
          texte:
            'Une vue d’ensemble de l’activité, des recettes et des stocks, service par service.',
        },
        {
          titre: 'Praticiens',
          texte:
            'Leur agenda, leurs patients et l’historique du dossier avant chaque consultation.',
        },
        {
          titre: 'Accueil et caisse',
          texte:
            'Rendez-vous, encaissements et documents, sans aller chercher l’information ailleurs.',
        },
      ],
    },
    appelFinal: 'Préparez l’inscription de votre clinique.',
    questionAutre: 'Vous gérez plutôt un poste de santé ?',
    notesTarif: [
      'Un abonnement pour la clinique, avec ses services et ses praticiens.',
      'Règlement mensuel prévu par Wave, Orange Money, Free Money ou carte.',
    ],
  },
}
