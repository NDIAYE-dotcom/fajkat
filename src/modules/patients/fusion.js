// Fusion de deux dossiers (owner et admin) : comparaison côte à côte et résumé avant
// confirmation. Le résumé reprend les règles de merge_patients (étapes 11 et 11b) :
// le dossier gardé garde ses valeurs, ses champs vides sont complétés par l'autre dossier,
// une date exacte l'emporte sur une date estimée, le téléphone différent devient le second
// téléphone. Aucune donnée médicale n'est comparée ici.

import { formatDate, formatTelephone } from '../../lib/format.js'
import { ETATS_CIVILS, libelleDe } from './fiche.js'
import { libelleAge, libelleNaissance, libelleTitulaire } from './utils.js'

const tel = (v) => (v ? formatTelephone(v) : null)

function naissance(p) {
  return [libelleNaissance(p), libelleAge(p)].filter(Boolean).join(', ') || null
}

function telephone(p) {
  if (!p.phone) return null
  return `${formatTelephone(p.phone)}${p.phone_owner ? ` (${libelleTitulaire(p.phone_owner)})` : ''}`
}

function accord(p) {
  if (p.whatsapp_consent === true) return 'Accepte'
  if (p.whatsapp_consent === false) return 'Refuse'
  return null
}

// Lignes du tableau de comparaison. mono : chiffres (police à chasse fixe).
export const LIGNES_COMPARAISON = [
  { cle: 'file_number', libelle: 'N° de dossier', valeur: (p) => p.file_number, mono: true },
  {
    cle: 'legacy_file_number',
    libelle: 'Ancien n° de dossier',
    valeur: (p) => p.legacy_file_number,
    mono: true,
  },
  { cle: 'last_name', libelle: 'Nom', valeur: (p) => p.last_name },
  { cle: 'first_name', libelle: 'Prénom', valeur: (p) => p.first_name },
  { cle: 'sex', libelle: 'Sexe', valeur: (p) => (p.sex === 'F' ? 'Féminin' : 'Masculin') },
  { cle: 'naissance', libelle: 'Naissance', valeur: naissance },
  { cle: 'phone', libelle: 'Téléphone', valeur: telephone, mono: true },
  {
    cle: 'phone_secondary',
    libelle: 'Second téléphone',
    valeur: (p) => tel(p.phone_secondary),
    mono: true,
  },
  { cle: 'neighborhood', libelle: 'Quartier ou village', valeur: (p) => p.neighborhood },
  { cle: 'commune', libelle: 'Commune', valeur: (p) => p.commune },
  { cle: 'mother_first_name', libelle: 'Prénom de la mère', valeur: (p) => p.mother_first_name },
  { cle: 'mother_last_name', libelle: 'Nom de la mère', valeur: (p) => p.mother_last_name },
  { cle: 'occupation', libelle: 'Profession', valeur: (p) => p.occupation },
  {
    cle: 'marital_status',
    libelle: 'Situation familiale',
    valeur: (p) => libelleDe(ETATS_CIVILS, p.marital_status) || null,
  },
  {
    cle: 'emergency_contact_name',
    libelle: 'Personne à prévenir',
    valeur: (p) => p.emergency_contact_name,
  },
  {
    cle: 'emergency_contact_phone',
    libelle: 'Téléphone à prévenir',
    valeur: (p) => tel(p.emergency_contact_phone),
    mono: true,
  },
  { cle: 'whatsapp_consent', libelle: 'Rappels WhatsApp', valeur: accord },
  {
    cle: 'created_at',
    libelle: 'Dossier créé le',
    valeur: (p) => formatDate(p.created_at),
    mono: true,
  },
]

function normal(v) {
  return (v ?? '').toString().trim().toLowerCase()
}

// Les deux valeurs d'une ligne diffèrent-elles ? (une valeur vide n'est pas une différence)
export function differe(ligne, a, b) {
  const va = ligne.valeur(a)
  const vb = ligne.valeur(b)
  return Boolean(va && vb && normal(va) !== normal(vb))
}

// Champs complétés depuis le dossier fusionné : vides dans le dossier gardé.
const COMPLETES = [
  'legacy_file_number',
  'neighborhood',
  'commune',
  'occupation',
  'marital_status',
  'mother_first_name',
  'mother_last_name',
  'emergency_contact_name',
  'emergency_contact_phone',
  'whatsapp_consent',
]

const LIGNE = Object.fromEntries(LIGNES_COMPARAISON.map((l) => [l.cle, l]))
const vide = (v) => v === null || v === undefined || v === ''

// Ce que la fusion va faire : { completes: [{ libelle, valeur }], ecartees: [{ libelle,
// gardee, ecartee }] }. Les valeurs écartées restent dans le journal de la fusion.
export function resumeFusion(garde, fusionne) {
  const completes = []
  const ecartees = []
  const completer = (cle, valeur) => completes.push({ libelle: LIGNE[cle].libelle, valeur })

  const dateFusionnee =
    fusionne.birth_date &&
    (!garde.birth_date || (garde.birth_date_estimated && !fusionne.birth_date_estimated))
  if (dateFusionnee) completer('naissance', naissance(fusionne))

  if (!garde.phone && fusionne.phone) completer('phone', telephone(fusionne))
  if (!garde.phone_secondary) {
    const second =
      fusionne.phone_secondary ??
      (garde.phone && fusionne.phone && fusionne.phone !== garde.phone ? fusionne.phone : null)
    if (second) completer('phone_secondary', tel(second))
  }
  COMPLETES.forEach((cle) => {
    if (vide(garde[cle]) && !vide(fusionne[cle])) completer(cle, LIGNE[cle].valeur(fusionne))
  })

  const comparees = ['last_name', 'first_name', 'sex', 'neighborhood', 'mother_first_name']
  if (!dateFusionnee) comparees.splice(3, 0, 'naissance')
  // Un téléphone différent n'est pas perdu : il devient le second téléphone s'il y a la place.
  if (garde.phone_secondary) comparees.push('phone')
  comparees.forEach((cle) => {
    if (differe(LIGNE[cle], garde, fusionne)) {
      ecartees.push({
        libelle: LIGNE[cle].libelle,
        gardee: LIGNE[cle].valeur(garde),
        ecartee: LIGNE[cle].valeur(fusionne),
      })
    }
  })
  return { completes, ecartees }
}
