// Ordonnance (sans affichage) : lignes du brouillon, posologie matin / midi / soir / nuit,
// quantité calculée, contrôles avant validation, phrases imprimées.
//
// Une ligne du brouillon a la forme attendue par encounter_insert_prescription (étape 14,
// partie A) : product_name, dosage, form, route_code, dose_morning… (nombres), dose_unit,
// as_needed, duration_days, quantity, quantity_unit, instructions. La base ignore les
// champs en plus, qui servent à l'écran seulement :
//   cle : identifiant stable de la ligne (ordre, focus) ;
//   form_code : forme choisie dans drug_forms ;
//   saisies : texte tapé (« 1/2 », « 1 ½ », « 0,5 »), gardé tel quel dans le brouillon ;
//   quantite_manuelle : quantité modifiée à la main, plus recalculée.
// Catalogue de la pharmacie et stock : étape 17 (product_id, toujours absent ici).

export const LIGNES_MAX = 30
export const NOTE_MAX = 500

// Les quatre prises de la journée, dans l'ordre imprimé.
export const PRISES = [
  { cle: 'matin', champ: 'dose_morning' },
  { cle: 'midi', champ: 'dose_noon' },
  { cle: 'soir', champ: 'dose_evening' },
  { cle: 'nuit', champ: 'dose_night' },
]

// Libellés des prises. Le wolof se modifie dans Paramètres → Ordonnance
// (organizations.settings.prescription_labels.wo) ; ces mots sont à valider.
export const LIBELLES_PRISES = {
  fr: { matin: 'Matin', midi: 'Midi', soir: 'Soir', nuit: 'Nuit' },
  wo: { matin: 'Suba', midi: 'Bëccëg', soir: 'Ngoon', nuit: 'Guddi' },
}

export function libellesPrises(langue, settings) {
  if (langue !== 'wo') return LIBELLES_PRISES.fr
  const perso = settings?.prescription_labels?.wo ?? {}
  return Object.fromEntries(
    PRISES.map(({ cle }) => [
      cle,
      typeof perso[cle] === 'string' && perso[cle].trim()
        ? perso[cle].trim()
        : LIBELLES_PRISES.wo[cle],
    ]),
  )
}

// Consignes proposées à la saisie (le soignant écrit ce qu'il veut).
export const CONSIGNES = [
  'Avant le repas',
  'Pendant le repas',
  'Après le repas',
  'À jeun',
  'Au coucher',
  'Avec beaucoup d’eau',
]

// --- Doses ---------------------------------------------------------------------------------

const FRACTIONS = { '½': 0.5, '¼': 0.25, '¾': 0.75 }
const VERS_FRACTION = { 0.25: '¼', 0.5: '½', 0.75: '¾' }

// Dose tapée : « 1 », « 0 », « 1/2 », « ½ », « 1 1/2 », « 1½ », « 0,5 ». null si vide,
// NaN si illisible ou hors de 0 à 100.
export function lireDose(texte) {
  let t = String(texte ?? '')
    .trim()
    .replace(',', '.')
  if (!t) return null
  for (const [signe, valeur] of Object.entries(FRACTIONS)) {
    t = t.replace(signe, ` ${valeur}`)
  }
  t = t.replace(/\s+/g, ' ').trim()
  let n = Number.NaN
  let m
  if (/^\d+(\.\d+)?$/.test(t)) n = Number(t)
  else if ((m = t.match(/^(\d+) (0\.\d+)$/))) n = Number(m[1]) + Number(m[2])
  else if ((m = t.match(/^(?:(\d+) )?(\d+)\/(\d+)$/)) && Number(m[3]) > 0) {
    n = Number(m[1] ?? 0) + Number(m[2]) / Number(m[3])
  }
  if (Number.isNaN(n) || n < 0 || n > 100) return Number.NaN
  // Deux décimales en base (numeric(5,2)) : 1/3 devient 0,33.
  return Math.round(n * 100) / 100
}

// 0,5 -> « ½ », 1,5 -> « 1 ½ », 2 -> « 2 », 0,33 -> « 0,33 ».
export function formatDose(n) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return ''
  const v = Number(n)
  const entier = Math.floor(v)
  const reste = Math.round((v - entier) * 100) / 100
  if (VERS_FRACTION[reste])
    return entier ? `${entier} ${VERS_FRACTION[reste]}` : VERS_FRACTION[reste]
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(v)
}

// « 1-0-1 », « 1 – 0 – 1 – 0 », « 1/2-0-1/2 » tapé dans une case : réparti sur les cases
// suivantes. null si ce n'est pas une suite de doses.
export function repartirDoses(texte) {
  const morceaux = String(texte ?? '')
    .split(/\s*[-–—]\s*/)
    .map((m) => m.trim())
  if (morceaux.length < 2 || morceaux.length > 4) return null
  if (morceaux.some((m) => !m || Number.isNaN(lireDose(m)))) return null
  return morceaux
}

// Durée en jours : entier de 1 à 365 ; null si vide, NaN sinon.
export function lireEntier(texte, min, max) {
  const t = String(texte ?? '').trim()
  if (!t) return null
  if (!/^\d+$/.test(t)) return Number.NaN
  const n = Number(t)
  return n < min || n > max ? Number.NaN : n
}

// --- Lignes --------------------------------------------------------------------------------

function nouvelleCle() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return `l-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function nouvelleLigne() {
  return {
    cle: nouvelleCle(),
    product_name: '',
    dosage: '',
    form: '',
    form_code: '',
    route_code: '',
    dose_morning: null,
    dose_noon: null,
    dose_evening: null,
    dose_night: null,
    dose_unit: '',
    as_needed: false,
    duration_days: null,
    quantity: null,
    quantity_unit: '',
    instructions: '',
    saisies: { matin: '', midi: '', soir: '', nuit: '', duree: '', quantite: '' },
    quantite_manuelle: false,
  }
}

export const ORDONNANCE_VIDE = { note: '', items: [] }

// Ordonnance venue du brouillon (serveur ou appareil), complétée des champs manquants.
export function normaliserOrdonnance(o) {
  const ord = o && typeof o === 'object' ? o : {}
  const items = Array.isArray(ord.items) ? ord.items : []
  return {
    note: typeof ord.note === 'string' ? ord.note : '',
    items: items
      .filter((i) => i && typeof i === 'object')
      .map((i) => {
        const base = nouvelleLigne()
        return { ...base, ...i, cle: i.cle || base.cle, saisies: { ...base.saisies, ...i.saisies } }
      }),
  }
}

const sommeDoses = (l) => PRISES.reduce((s, p) => s + (Number(l[p.champ]) || 0), 0)

// Quantité totale pour une forme comptée à l'unité : prises par jour × jours, arrondie
// à l'unité supérieure (on ne délivre pas un demi-comprimé). null si incalculable.
export function quantiteCalculee(ligne, forme) {
  if (!forme?.counted || !ligne.duration_days) return null
  const parJour = sommeDoses(ligne)
  if (!parJour) return null
  return Math.min(Math.ceil(parJour * ligne.duration_days), 10000)
}

// Ligne mise à jour d'après les cases tapées : doses, durée, quantité et unités dérivées.
// formes : référentiel drug_forms.
export function majLigne(ligne, champs, formes = []) {
  const l = { ...ligne, ...champs, saisies: { ...ligne.saisies, ...champs.saisies } }
  const forme = formes.find((f) => f.code === l.form_code)
  if ('form_code' in champs) l.form = forme?.label ?? ''
  for (const p of PRISES) {
    const n = lireDose(l.saisies[p.cle])
    l[p.champ] = Number.isNaN(n) ? null : n
  }
  const duree = lireEntier(l.saisies.duree, 1, 365)
  l.duration_days = Number.isNaN(duree) ? null : duree
  l.dose_unit = forme?.dose_unit ?? ''

  if (champs.saisies && 'quantite' in champs.saisies) {
    l.quantite_manuelle = l.saisies.quantite.trim() !== ''
  }
  // Quantité non modifiée à la main : celle du calcul (vide pour un sirop, une pommade…).
  if (!l.quantite_manuelle) {
    const calculee = quantiteCalculee(l, forme)
    l.saisies.quantite = calculee === null ? '' : String(calculee)
  }
  const quantite = lireEntier(l.saisies.quantite, 1, 10000)
  l.quantity = Number.isNaN(quantite) ? null : quantite
  l.quantity_unit = uniteQuantite(forme, l.quantity)
  return l
}

// Quantité recalculée à la demande (après une modification à la main).
export function recalculerQuantite(ligne, formes) {
  return majLigne({ ...ligne, quantite_manuelle: false }, {}, formes)
}

export function uniteQuantite(forme, n) {
  if (!forme) return ''
  if (forme.counted) return n > 1 ? forme.dose_unit_plural : forme.dose_unit
  return n > 1 ? forme.pack_unit_plural : forme.pack_unit
}

export function deplacer(liste, index, sens) {
  const cible = index + sens
  if (cible < 0 || cible >= liste.length) return liste
  const copie = [...liste]
  ;[copie[index], copie[cible]] = [copie[cible], copie[index]]
  return copie
}

// Une ligne entièrement vide (ajoutée puis jamais remplie) ne part pas à la validation.
export function ligneVide(l) {
  return (
    !l.product_name?.trim() &&
    !l.dosage?.trim() &&
    !l.instructions?.trim() &&
    Object.values(l.saisies ?? {}).every((v) => !String(v).trim())
  )
}

// Ordonnance envoyée à la validation : lignes vides retirées.
export function ordonnancePourValidation(o) {
  const ord = normaliserOrdonnance(o)
  return { ...ord, items: ord.items.filter((l) => !ligneVide(l)) }
}

// --- Dosage ---------------------------------------------------------------------------------

// « 500mg » -> « 500 mg », « 1,5g » -> « 1,5 g », « 250mg/5ml » -> « 250 mg/5 ml ».
export function normaliserDosage(texte) {
  return String(texte ?? '').replace(/(\d)(?=[a-zA-Zµ])/g, '$1 ')
}

// Dosage invraisemblable, sans doute une faute de frappe : un nombre de 10 ou plus suivi
// de « g » (« 500 g » pour 500 mg). Renvoie « 500 g », ou null. Simple avertissement :
// le soignant reste juge.
export function dosageDouteux(texte) {
  const m = String(texte ?? '').match(/(\d+(?:[.,]\d+)?)\s*g(?![a-zA-Zµ])/i)
  if (!m) return null
  const n = Number(m[1].replace(',', '.'))
  return n >= 10 ? `${m[1]} g` : null
}

// --- Contrôles avant validation ------------------------------------------------------------

// Mêmes règles que la base, pour signaler chaque erreur sous sa case.
// Renvoie { note?, lignes?: { [cle]: { champ: message } } }.
export function verifierOrdonnance(o) {
  const erreurs = {}
  const ord = normaliserOrdonnance(o)
  if (ord.note.trim().length > NOTE_MAX) erreurs.note = `${NOTE_MAX} caractères au plus.`
  const lignes = {}
  for (const l of ord.items) {
    if (ligneVide(l)) continue
    const e = {}
    const nom = l.product_name.trim()
    if (nom.length < 2) e.product_name = 'Écrivez le nom du médicament.'
    else if (nom.length > 120) e.product_name = '120 caractères au plus.'
    for (const p of PRISES) {
      if (Number.isNaN(lireDose(l.saisies[p.cle]))) {
        e[p.cle] = 'Tapez un nombre : 1, 2, 1/2 ou 0,5.'
      }
    }
    if (Number.isNaN(lireEntier(l.saisies.duree, 1, 365))) {
      e.duree = 'Un nombre de jours entre 1 et 365.'
    }
    if (Number.isNaN(lireEntier(l.saisies.quantite, 1, 10000))) {
      e.quantite = 'Un nombre entier, par exemple 6.'
    }
    if ((l.instructions ?? '').trim().length > 300) e.instructions = '300 caractères au plus.'
    if (Object.keys(e).length) lignes[l.cle] = e
  }
  if (Object.keys(lignes).length) erreurs.lignes = lignes
  return erreurs
}

// Avertissements non bloquants, rappelés dans la fenêtre de validation : forme absente
// sans quantité, dosage invraisemblable. Une phrase par ligne concernée.
export function avertissementsOrdonnance(o) {
  const avertissements = []
  for (const l of normaliserOrdonnance(o).items) {
    if (ligneVide(l)) continue
    const nom = [l.product_name.trim() || 'Médicament sans nom', l.dosage?.trim()]
      .filter(Boolean)
      .join(' ')
    if (!l.form_code && !l.form && !l.quantity) {
      avertissements.push(`${nom} — Forme non choisie : la quantité ne sera pas calculée.`)
    }
    const douteux = dosageDouteux(l.dosage)
    if (douteux) avertissements.push(`${nom} — Vérifiez le dosage : ${douteux} ?`)
  }
  return avertissements
}

// --- Phrases (écran et impression) ---------------------------------------------------------

const pluriel = (n, un, plusieurs) => (n > 1 ? plusieurs : un)

// « 500 mg · Comprimé · Par la bouche ».
export function resumeProduit(l, voies = []) {
  const voie = voies.find((v) => v.code === l.route_code)?.label
  return [l.dosage, l.form, voie].filter((x) => x && String(x).trim()).join(' · ')
}

// « Pendant 5 jours. » ; « Si besoin. » ; rien si aucune durée.
export function phraseDuree(l) {
  const morceaux = []
  if (l.duration_days) {
    morceaux.push(`Pendant ${l.duration_days} ${pluriel(l.duration_days, 'jour', 'jours')}.`)
  }
  if (l.as_needed) morceaux.push('Seulement si besoin.')
  return morceaux.join(' ')
}

// « Quantité : 10 comprimés ».
export function phraseQuantite(l) {
  if (!l.quantity) return ''
  return `Quantité : ${l.quantity}${l.quantity_unit ? ` ${l.quantity_unit}` : ''}`
}

// « 1 – 0 – 1 – 0 » ; vide si aucune prise.
export function resumePosologie(l) {
  if (PRISES.every((p) => !Number(l[p.champ]))) return ''
  return PRISES.map((p) => formatDose(l[p.champ] ?? 0) || '0').join(' – ')
}
