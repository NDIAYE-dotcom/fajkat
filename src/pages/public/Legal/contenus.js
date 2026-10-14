// Textes PROVISOIRES des pages légales, à faire valider par un juriste avant toute mise en ligne.
// Les informations inconnues sont affichées « [à compléter] » (voir src/lib/editeur.js).

import { EDITEUR, ouACompleter } from '../../../lib/editeur.js'
import { formatTelephone } from '../../../lib/format.js'
import { CONTACT_DEMO } from '../../../lib/offres.js'

const editeur = `${EDITEUR.raisonSociale}, ${EDITEUR.adresse} (Sénégal), NINEA ${EDITEUR.ninea}`
const contact = `WhatsApp ${formatTelephone(CONTACT_DEMO.whatsapp)} · e-mail ${ouACompleter(CONTACT_DEMO.email)}`

export const DOCUMENTS = {
  mentions: {
    titre: 'Mentions légales',
    sections: [
      {
        titre: 'Éditeur du site',
        paragraphes: [
          `Le site Fajkat est édité par ${editeur}.`,
          `Directeur de la publication : ${ouACompleter(EDITEUR.directeurPublication)}.`,
          `Contact : ${contact}.`,
        ],
      },
      {
        titre: 'Hébergement',
        paragraphes: [
          'Le site public est hébergé par Vercel Inc.',
          'Les données de l’application sont hébergées par Supabase. Région d’hébergement : [à compléter].',
        ],
      },
      {
        titre: 'Propriété intellectuelle',
        paragraphes: [
          `Les textes, illustrations et éléments graphiques du site sont la propriété de ${EDITEUR.raisonSociale}, sauf mention contraire. Toute reproduction sans autorisation est interdite.`,
        ],
      },
    ],
  },

  confidentialite: {
    titre: 'Politique de confidentialité',
    sections: [
      {
        titre: 'Responsable du traitement',
        paragraphes: [
          `${editeur}. Contact : ${contact}.`,
          'Pour les données des patients saisies dans l’application, chaque structure de santé reste responsable de ses propres données ; Fajkat agit pour son compte.',
        ],
      },
      {
        titre: 'Données concernées',
        paragraphes: [
          'Sur le site public : aucune donnée n’est collectée sans action de votre part. Le choix de l’offre consultée est seulement mémorisé dans votre navigateur.',
          'Dans l’application : les informations de la structure, de ses utilisateurs, et les données des patients saisies par l’équipe soignante.',
        ],
      },
      {
        titre: 'Protection des données de santé',
        paragraphes: [
          'Chaque structure n’accède qu’à ses propres données, selon le rôle de chaque utilisateur. Les documents (ordonnances, signatures, cachets) sont conservés dans des espaces privés.',
          'Les données sensibles sont réservées aux soignants habilités, et chaque consultation de ces données est enregistrée.',
          'Ces protections font partie de la conception de Fajkat, actuellement en cours de développement.',
        ],
      },
      {
        titre: 'Durée de conservation',
        paragraphes: [
          'Les données sont conservées pendant toute la durée de l’abonnement. Après une résiliation, elles restent accessibles en lecture seule pendant 90 jours pour permettre leur export, puis elles sont supprimées.',
        ],
      },
      {
        titre: 'Vos droits',
        paragraphes: [
          'Vous pouvez demander l’accès, la rectification ou la suppression de vos données personnelles, ou vous opposer à leur traitement, en écrivant aux contacts ci-dessus.',
          'Au Sénégal, la protection des données personnelles est encadrée par la loi n° 2008-12 du 25 janvier 2008 et contrôlée par la Commission de protection des données personnelles (CDP).',
        ],
      },
    ],
  },

  cgu: {
    titre: 'Conditions générales d’utilisation',
    sections: [
      {
        titre: 'Objet',
        paragraphes: [
          `Les présentes conditions encadrent l’utilisation de Fajkat, logiciel de gestion pour les postes de santé et les cliniques, édité par ${editeur}.`,
          'Fajkat est en cours de développement : les modules marqués « Prévu » ne sont pas encore disponibles.',
        ],
      },
      {
        titre: 'Abonnement',
        paragraphes: [
          'L’abonnement est mensuel et sans engagement. Son prix dépend de l’offre choisie (Poste de santé ou Clinique) et figure sur la page de chaque offre.',
          'Le règlement est prévu par Wave, Orange Money, Free Money ou carte.',
        ],
      },
      {
        titre: 'Résiliation et récupération des données',
        paragraphes: [
          'La structure peut résilier à tout moment ; la résiliation prend effet à la fin du mois payé.',
          'La structure peut exporter toutes ses données à tout moment : Excel pour les listes, PDF pour les dossiers et documents. Après une résiliation, les données restent accessibles en lecture seule pendant 90 jours, puis elles sont supprimées.',
        ],
      },
      {
        titre: 'Responsabilités',
        paragraphes: [
          'La structure est responsable des informations saisies par ses utilisateurs et de la gestion de leurs accès. Les décisions médicales restent celles des soignants.',
          '[à compléter : limites de responsabilité, disponibilité du service]',
        ],
      },
      {
        titre: 'Droit applicable',
        paragraphes: [
          'Les présentes conditions sont soumises au droit sénégalais. [à compléter : juridiction compétente]',
        ],
      },
    ],
  },
}
