// Données de partage et de référencement des pages publiques, en un seul endroit.
// Lues par l'application (titre de l'onglet) ET par scripts/pages-statiques.js, qui écrit
// ces balises dans le HTML statique de chaque adresse après le build : WhatsApp et Facebook
// ne lisent pas le JavaScript pour construire leurs aperçus de lien.
// Ce fichier ne doit rien importer : il est aussi lu directement par Node.

// Domaine provisoire, à remplacer une fois le nom de domaine choisi.
export const SITE = {
  url: 'https://fajkat.sn',
  nom: 'Fajkat',
  couleurTheme: '#2f5d57',
}

// Images de partage : 1200 × 630 px, dans public/images/partage/.
const IMAGE = { largeur: 1200, hauteur: 630 }

// fichier : nom du fichier HTML produit dans dist/ (index.html pour l'accueil).
export const PAGES_PARTAGE = {
  '/': {
    fichier: 'index.html',
    titre: 'Fajkat — Gestion des postes de santé et des cliniques',
    description:
      'Logiciel de gestion pour les postes de santé et les cliniques au Sénégal : patients, consultations, pharmacie, caisse et rappels WhatsApp. En cours de développement.',
    image: '/images/partage/fajkat.png',
    imageAlt: 'Fajkat, gestion des structures de santé',
    // Image principale de la page, préchargée dans le HTML statique (elle n'est découverte
    // qu'après le JavaScript sinon). media : même point de bascule que le CSS (40rem).
    prechargements: [
      { href: '/images/poste-sante-mobile.webp', media: '(max-width: 40rem)' },
      { href: '/images/poste-sante.webp', media: '(min-width: 40.01rem)' },
    ],
  },
  '/poste-de-sante': {
    fichier: 'poste-de-sante.html',
    titre: 'Fajkat — Offre Poste de santé',
    description:
      'Accueil, consultations prénatales, vaccination, dépôt et caisse : tout le poste de santé dans un seul registre, même quand la connexion faiblit.',
    image: '/images/partage/poste-sante.png',
    imageAlt: 'Offre Poste de santé de Fajkat',
    prechargements: [{ href: '/images/poste-sante.webp' }],
  },
  '/clinique': {
    fichier: 'clinique.html',
    titre: 'Fajkat — Offre Clinique',
    description:
      'Plusieurs services, un seul dossier patient : agenda des praticiens, hospitalisation, laboratoire, facturation et tiers payants.',
    image: '/images/partage/clinique.png',
    imageAlt: 'Offre Clinique de Fajkat',
    prechargements: [{ href: '/images/clinique.webp' }],
  },
}

export const DIMENSIONS_IMAGE_PARTAGE = IMAGE

// Adresses publiques déclarées dans le sitemap.
export const PAGES_SITEMAP = [
  '/',
  '/poste-de-sante',
  '/clinique',
  '/mentions-legales',
  '/confidentialite',
  '/cgu',
]

// Titre de l'onglet pour une adresse publique (l'accueil par défaut).
export function titrePage(chemin) {
  return (PAGES_PARTAGE[chemin] ?? PAGES_PARTAGE['/']).titre
}
