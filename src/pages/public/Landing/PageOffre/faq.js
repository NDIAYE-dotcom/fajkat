// Questions fréquentes de chaque offre. Réponses courtes et honnêtes :
// ce qui n'existe pas encore est dit « prévu ». Résiliation et accompagnement :
// conditions fournies par le porteur du projet (14/10/2026).

const SECURITE = {
  question: 'Mes données et celles de mes patients sont-elles protégées ?',
  reponse: [
    'Chaque structure ne voit que ses propres données, et chaque utilisateur n’accède qu’à ce que son rôle permet. Les ordonnances, signatures et cachets sont conservés dans des espaces privés.',
    'Les données sensibles (VIH, santé mentale…) sont réservées aux soignants habilités, et chaque consultation est enregistrée. Ces protections sont prévues dès la conception : Fajkat est en cours de développement.',
  ],
}

const COUPURE = {
  question: 'Que se passe-t-il en cas de coupure d’internet ou d’électricité ?',
  reponse: [
    'Les formulaires longs sont enregistrés en brouillon sur l’appareil au fil de la saisie : une coupure ne fait pas perdre ce qui a été tapé.',
    'Un mode hors connexion est prévu pour les écrans essentiels, avec un envoi automatique dès le retour du réseau.',
  ],
}

const PAIEMENT = {
  question: 'Puis-je payer l’abonnement par Wave ou Orange Money ?',
  reponse: [
    'Oui, c’est prévu : le règlement mensuel pourra se faire par Wave, Orange Money, Free Money ou carte. Le paiement en ligne est en cours d’intégration.',
    'Dans la caisse de votre structure, chaque encaissement des patients pourra être noté en espèces, Wave, Orange Money ou Free Money.',
  ],
}

const RESILIATION = {
  question: 'Puis-je résilier ? Que deviennent mes données ?',
  reponse: [
    'L’abonnement est mensuel et sans engagement. Vous pouvez résilier à tout moment ; la résiliation prend effet à la fin du mois payé.',
    'Vous pouvez exporter toutes vos données à tout moment : Excel pour les listes, PDF pour les dossiers et documents. Après une résiliation, elles restent accessibles en lecture seule pendant 90 jours pour l’export, puis elles sont supprimées.',
  ],
}

const FORMATION = {
  question: 'Serons-nous formés et accompagnés ?',
  reponse: [
    'Oui. La mise en place et la prise en main sont incluses, à distance par WhatsApp ou en visio. Une formation sur place est possible à Dakar et en région, sur demande.',
    'Le support répond sur WhatsApp aux heures ouvrables.',
  ],
}

const TELEPHONE = {
  question: 'Peut-on utiliser Fajkat sur un téléphone ?',
  reponse: [
    'Oui, c’est même le point de départ : chaque écran est conçu pour un téléphone Android d’entrée de gamme, avec des pages légères et lisibles en plein soleil.',
    'Un ordinateur reste possible, et l’impression des tickets 80 mm et des documents A4 ou A5 est prévue.',
  ],
}

export const FAQ_OFFRES = {
  poste_sante: [
    SECURITE,
    COUPURE,
    {
      question: 'Pourrons-nous passer à l’offre Clinique plus tard ?',
      reponse: [
        'Oui. Le passage de l’offre Poste de santé à l’offre Clinique se fait sans perte de données : dossiers, historique et stock sont conservés, et les modules de la Clinique s’ajoutent.',
      ],
    },
    PAIEMENT,
    RESILIATION,
    FORMATION,
    TELEPHONE,
  ],
  clinique: [
    SECURITE,
    COUPURE,
    {
      question: 'Nous utilisons déjà l’offre Poste de santé : pouvons-nous passer à Clinique ?',
      reponse: [
        'Oui. Le passage de l’offre Poste de santé à l’offre Clinique se fait sans perte de données : dossiers, historique et stock sont conservés, et les modules de la Clinique s’ajoutent.',
        'Pour un passage dans l’autre sens, écrivez-nous : les conditions seront précisées.',
      ],
    },
    PAIEMENT,
    RESILIATION,
    FORMATION,
    TELEPHONE,
  ],
}
