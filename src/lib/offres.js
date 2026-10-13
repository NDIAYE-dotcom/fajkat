// Source unique des offres commerciales affichées sur le site public.
// Les prix sont des entiers en FCFA. Ils seront repris de la table « plans » lorsque
// celle-ci existera ; d'ici là, toute modification de tarif se fait ici et nulle part ailleurs.

import { formatFCFA } from './format.js'

// État d'avancement d'un module, affiché tel quel aux visiteurs.
// Un module ne passe à « disponible » qu'une fois développé, testé et validé.
export const STATUTS_MODULE = {
  disponible: {
    libelle: 'Disponible',
    description: 'Développé, testé et utilisable aujourd’hui.',
  },
  prevu: {
    libelle: 'Prévu',
    description: 'Inclus dans le périmètre de l’offre, en cours de développement.',
  },
}

export const OFFRES = {
  poste_sante: {
    type: 'poste_sante',
    nom: 'Poste de santé',
    prixMensuel: 5500,
    choix: {
      reperage: 'Soins de proximité',
      description:
        'Pour l’ICP, la sage-femme et l’équipe d’un poste public, privé, confessionnel ou communautaire.',
      bouton: 'Découvrir l’offre Poste de santé',
    },
    fonctionnalites: [
      {
        code: 'patients',
        titre: 'Patients et ménages',
        description:
          'Un dossier par personne, même quand toute la famille partage un numéro. Recherche par nom, téléphone, quartier et prénom de la mère.',
        statut: 'prevu',
      },
      {
        code: 'consultations',
        titre: 'Consultations et soins',
        description:
          'Motif, examen, diagnostic et traitement en quelques champs, avec l’historique du patient sous les yeux.',
        statut: 'prevu',
      },
      {
        code: 'file_attente',
        titre: 'Accueil et rendez-vous',
        description:
          'Ticket de passage, ordre d’arrivée et priorité aux femmes enceintes, aux enfants de moins de 5 ans et aux personnes âgées.',
        statut: 'prevu',
      },
      {
        code: 'maternite',
        titre: 'Grossesse et parcours mère-enfant',
        description:
          'Consultations prénatales, accouchement, suivi post-natal et planification familiale.',
        statut: 'prevu',
      },
      {
        code: 'vaccination',
        titre: 'Vaccination',
        description:
          'Calendrier vaccinal configurable : quand le calendrier national change, il se met à jour sans nouvelle version du logiciel.',
        statut: 'prevu',
      },
      {
        code: 'pharmacie',
        titre: 'Dépôt de médicaments et consommables',
        description: 'Dispensation reliée à l’ordonnance, chaque sortie est tracée.',
        statut: 'prevu',
      },
      {
        code: 'stock',
        titre: 'Inventaire et alertes de stock',
        description:
          'Seuils de réapprovisionnement, lots et dates de péremption signalés avant qu’il ne soit trop tard.',
        statut: 'prevu',
      },
      {
        code: 'caisse',
        titre: 'Caisse, recettes et dépenses',
        description:
          'Espèces, Wave ou Orange Money, et une clôture de caisse avec billetage en fin de journée.',
        statut: 'prevu',
      },
      {
        code: 'personnel',
        titre: 'Personnel et activités',
        description: 'Gardes, présences et répartition des tâches de l’équipe.',
        statut: 'prevu',
      },
      {
        code: 'documents',
        titre: 'Documents imprimables et rapports',
        description:
          'Ordonnances, certificats et reçus prêts à imprimer ; rapports d’activité préparés à partir des données saisies.',
        statut: 'prevu',
      },
      {
        code: 'whatsapp_liens',
        titre: 'Rappels par WhatsApp',
        description:
          'Rappels de rendez-vous et de vaccins envoyés au patient ou à sa famille, en français ou en wolof.',
        reserve: 'Sous réserve de l’intégration effective de WhatsApp.',
        statut: 'prevu',
      },
    ],
  },

  clinique: {
    type: 'clinique',
    nom: 'Clinique',
    prixMensuel: 10500,
    choix: {
      reperage: 'Plusieurs services',
      description:
        'Pour les cliniques et cabinets qui réunissent plusieurs praticiens, services ou spécialités.',
      bouton: 'Découvrir l’offre Clinique',
    },
    // Pour la clinique, les fonctionnalités sont regroupées par pôle.
    poles: [
      {
        id: 'accueil',
        titre: 'Accueil et agenda',
        intro: 'Le premier contact du patient, sans file désordonnée ni dossier en double.',
        fonctionnalites: [
          {
            code: 'patients',
            titre: 'Dossiers patients centralisés',
            description:
              'Un seul dossier par patient, partagé entre les services, avec une recherche qui distingue les homonymes.',
            statut: 'prevu',
          },
          {
            code: 'agenda_multi_praticiens',
            titre: 'Rendez-vous par praticien ou spécialité',
            description:
              'Un agenda par praticien, des créneaux par spécialité, et l’accueil qui voit les disponibilités d’un coup d’œil.',
            statut: 'prevu',
          },
        ],
      },
      {
        id: 'soins',
        titre: 'Soins et services',
        intro: 'Chaque service travaille dans son espace, sur le même dossier patient.',
        fonctionnalites: [
          {
            code: 'consultations',
            titre: 'Consultations et suivi des soins',
            description:
              'Observations, prescriptions et comptes rendus rattachés au dossier, consultables par l’équipe habilitée.',
            statut: 'prevu',
          },
          {
            code: 'services',
            titre: 'Organisation par services',
            description:
              'Médecine générale, pédiatrie, maternité ou autres : chaque service a ses praticiens, ses actes et ses tarifs.',
            statut: 'prevu',
          },
          {
            code: 'laboratoire',
            titre: 'Laboratoire, examens et hospitalisation',
            description: 'Demandes d’examens, résultats et suivi des patients hospitalisés.',
            reserve: 'Modules envisagés, selon le périmètre retenu.',
            statut: 'prevu',
          },
        ],
      },
      {
        id: 'pharmacie',
        titre: 'Pharmacie et stocks',
        intro: 'Savoir ce qui reste, ce qui expire et ce qu’il faut commander.',
        fonctionnalites: [
          {
            code: 'stock',
            titre: 'Pharmacie, lots et dates de péremption',
            description:
              'Entrées par lot, sorties tracées, alertes avant péremption et avant rupture.',
            statut: 'prevu',
          },
        ],
      },
      {
        id: 'gestion',
        titre: 'Gestion et finances',
        intro: 'Les chiffres de la clinique, tenus au fil de l’activité plutôt qu’en fin de mois.',
        fonctionnalites: [
          {
            code: 'caisse',
            titre: 'Facturation, paiements et caisse',
            description:
              'Factures par acte, part patient et part assurance, encaissements en espèces ou mobile money.',
            statut: 'prevu',
          },
          {
            code: 'comptabilite',
            titre: 'Comptabilité de gestion',
            description: 'Recettes, dépenses et états de gestion par période et par service.',
            statut: 'prevu',
          },
          {
            code: 'personnel',
            titre: 'Équipes et plannings',
            description: 'Plannings, gardes et présences du personnel médical et administratif.',
            statut: 'prevu',
          },
          {
            code: 'documents',
            titre: 'Documents professionnels imprimables',
            description:
              'Ordonnances, certificats, factures et comptes rendus à l’en-tête de la clinique.',
            statut: 'prevu',
          },
          {
            code: 'whatsapp_api',
            titre: 'Communication avec les patients par WhatsApp',
            description: 'Confirmations et rappels de rendez-vous, informations administratives.',
            reserve: 'Sous réserve de configuration de WhatsApp.',
            statut: 'prevu',
          },
        ],
      },
    ],
  },
}

export const TYPES_OFFRE = Object.keys(OFFRES)

export function estTypeOffre(type) {
  return TYPES_OFFRE.includes(type)
}

export function getOffre(type) {
  return estTypeOffre(type) ? OFFRES[type] : null
}

// « 5 500 FCFA » — le montant seul, la période est affichée à part.
export function prixOffre(offre) {
  return formatFCFA(offre.prixMensuel)
}

// « 5 500 FCFA/mois » — pour les phrases et les libellés accessibles.
export function prixOffreParMois(offre) {
  return `${formatFCFA(offre.prixMensuel)}/mois`
}

// Toutes les fonctionnalités d'une offre, à plat, quelle que soit sa présentation.
export function fonctionnalitesOffre(offre) {
  if (offre.fonctionnalites) return offre.fonctionnalites
  return offre.poles.flatMap((pole) => pole.fonctionnalites)
}

export function compterParStatut(offre) {
  const compte = { disponible: 0, prevu: 0 }
  for (const f of fonctionnalitesOffre(offre)) compte[f.statut] += 1
  return compte
}
