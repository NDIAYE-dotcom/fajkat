// Source unique des offres commerciales affichées sur le site public.
// Les prix sont des entiers en FCFA. Ils seront repris de la table « plans » lorsque
// celle-ci existera ; d'ici là, toute modification de tarif se fait ici et nulle part ailleurs.
// Le détail des modules vit dans src/lib/modules.js.

import { formatFCFA } from './format.js'
import { FAMILLES, MODULES } from './modules.js'

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

// Modules déjà développés et validés : aucun pour l'instant.
const MODULES_DISPONIBLES = []

// Demande de démo : la conversation WhatsApp s'ouvre avec un message pré-rempli.
export const CONTACT_DEMO = {
  whatsapp: '+221779605825',
  message: 'Bonjour, je souhaite une démo de Fajkat',
  // Adresse e-mail de contact (null = « [à compléter] »).
  email: 'contact@fajkat.com',
}

const DEFINITIONS = {
  poste_sante: {
    type: 'poste_sante',
    nom: 'Poste de santé',
    // Adresse publique de la page de l'offre.
    chemin: '/poste-de-sante',
    prixMensuel: 5500,
    // Complément du message de démo : « … pour mon poste de santé. »
    pourDemo: 'mon poste de santé',
    choix: {
      reperage: 'Soins de proximité',
      description:
        'Pour l’ICP, la sage-femme et l’équipe d’un poste public, privé, confessionnel ou communautaire.',
    },
    phares: ['patients', 'maternite', 'vaccination', 'pharmacie', 'stock', 'whatsapp_liens'],
  },

  clinique: {
    type: 'clinique',
    nom: 'Clinique',
    chemin: '/clinique',
    prixMensuel: 10500,
    pourDemo: 'ma clinique',
    choix: {
      reperage: 'Plusieurs services',
      description:
        'Pour les cliniques et cabinets qui réunissent plusieurs praticiens, services ou spécialités.',
    },
    phares: [
      'agenda_multi_praticiens',
      'hospitalisation',
      'laboratoire',
      'caisse',
      'tiers_payants',
      'whatsapp_api',
    ],
  },
}

// Fonctionnalités d'une offre, dans l'ordre des familles, avec les textes propres à l'offre.
function construireFonctionnalites(definition) {
  return FAMILLES.flatMap((famille) =>
    MODULES.filter((m) => m.famille === famille.id && m.offres.includes(definition.type)).map(
      ({ variantes, ...module }) => ({
        ...module,
        ...variantes?.[definition.type],
        phare: definition.phares.includes(module.code),
        statut: MODULES_DISPONIBLES.includes(module.code) ? 'disponible' : 'prevu',
      }),
    ),
  )
}

export const OFFRES = Object.fromEntries(
  Object.entries(DEFINITIONS).map(([type, definition]) => [
    type,
    { ...definition, fonctionnalites: construireFonctionnalites(definition) },
  ]),
)

export const TYPES_OFFRE = Object.keys(OFFRES)

export function estTypeOffre(type) {
  return TYPES_OFFRE.includes(type)
}

export function getOffre(type) {
  return estTypeOffre(type) ? OFFRES[type] : null
}

// Offre correspondant à une adresse (« /clinique »), ou null pour toute autre adresse.
export function offreDepuisChemin(chemin) {
  return Object.values(OFFRES).find((offre) => offre.chemin === chemin) ?? null
}

export function autreOffre(type) {
  return OFFRES[TYPES_OFFRE.find((t) => t !== type)]
}

// « 5 500 FCFA » — le montant seul, la période est affichée à part.
export function prixOffre(offre) {
  return formatFCFA(offre.prixMensuel)
}

// « 5 500 FCFA/mois » — pour les phrases et les libellés accessibles.
export function prixOffreParMois(offre) {
  return `${formatFCFA(offre.prixMensuel)}/mois`
}

export function fonctionnalitesOffre(offre) {
  return offre.fonctionnalites
}

// Les familles de l'offre, chacune avec ses fonctionnalités (familles vides écartées).
export function famillesOffre(offre) {
  return FAMILLES.map((famille) => ({
    ...famille,
    fonctionnalites: offre.fonctionnalites.filter((f) => f.famille === famille.id),
  })).filter((famille) => famille.fonctionnalites.length > 0)
}

export function compterParStatut(offre) {
  const compte = { disponible: 0, prevu: 0 }
  for (const f of offre.fonctionnalites) compte[f.statut] += 1
  return compte
}

// Lien wa.me avec le message pré-rempli, adapté à l'offre affichée (ou générique sans offre).
export function lienDemoWhatsApp(offre) {
  const message = offre
    ? `${CONTACT_DEMO.message} pour ${offre.pourDemo}.`
    : `${CONTACT_DEMO.message}.`
  const numero = CONTACT_DEMO.whatsapp.replace(/\D/g, '')
  return `https://wa.me/${numero}?text=${encodeURIComponent(message)}`
}
