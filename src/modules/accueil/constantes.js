// Constantes : mesures saisies, lecture des nombres (virgule acceptée), libellés des seuils
// et messages des refus de la base. Aucun seuil médical ici : ils vivent dans la table
// vital_thresholds de chaque structure. Les bornes de vraisemblance (fautes de frappe)
// viennent de la base (vital_sign_bounds), jamais écrites ici.

export const MESURES = [
  {
    cle: 'weight_kg',
    libelle: 'Poids',
    unite: 'kg',
    decimal: true,
    exemple: '68,5',
    aide: 'Exemple : 68,5',
  },
  { cle: 'height_cm', libelle: 'Taille', unite: 'cm', decimal: true, exemple: '165' },
  {
    cle: 'temperature_c',
    libelle: 'Température',
    unite: '°C',
    decimal: true,
    exemple: '37,2',
    aide: 'Exemple : 37,2',
  },
  {
    cle: 'systolic',
    libelle: 'Tension systolique',
    court: 'Systolique',
    unite: 'mmHg',
    exemple: '180',
    aide: '180/110 ou 18/11 se répartit dans les deux cases.',
  },
  {
    cle: 'diastolic',
    libelle: 'Tension diastolique',
    court: 'Diastolique',
    unite: 'mmHg',
    exemple: '110',
  },
  { cle: 'pulse', libelle: 'Pouls', unite: '/min', exemple: '80' },
  { cle: 'spo2', libelle: 'Saturation (SpO2)', unite: '%', exemple: '98' },
  {
    cle: 'glucose_g_l',
    libelle: 'Glycémie capillaire',
    unite: 'g/L',
    decimal: true,
    exemple: '1,10',
    aide: 'Exemple : 1,10',
  },
  {
    cle: 'muac_mm',
    libelle: 'Périmètre brachial',
    unite: 'mm',
    exemple: '125',
    aide: 'En millimètres : 125 mm = 12,5 cm',
  },
]

const TENSION = ['systolic', 'diastolic']

// Sous ce nombre, une tension est lue en centimètres de mercure, comme on l'écrit souvent
// au Sénégal (18/11) : aucune tension en mmHg n'est aussi basse (borne technique, pas un
// seuil médical).
const LIMITE_CMHG = 30

// « 180/110 », « 180 / 110 », « 18/11 », « 18,5/11 » -> ['180', '110'] ; sinon null.
export function separerTension(texte) {
  const m = String(texte ?? '').match(/^\s*(\d+(?:[.,]\d+)?)\s*\/\s*(\d+(?:[.,]\d+)?)\s*$/)
  return m ? [m[1], m[2]] : null
}

// Saisie dont une case de tension contient « 180/110 » ou « 18/11 » : valeur répartie
// dans les deux cases. Renvoie la même saisie s'il n'y a rien à répartir.
export function repartirTension(saisie) {
  for (const cle of TENSION) {
    const paire = separerTension(saisie[cle])
    if (paire) return { ...saisie, systolic: paire[0], diastolic: paire[1] }
  }
  return saisie
}

// Tension saisie -> mmHg (18 -> 180, 18,5 -> 185). null si vide, NaN si illisible.
export function lireTension(texte) {
  const n = lireNombre(texte)
  if (n == null || Number.isNaN(n)) return n
  return n < LIMITE_CMHG ? Math.round(n * 10) : n
}

// « 18/11 cmHg = 180/110 mmHg », si la saisie a été convertie ; sinon null.
export function mentionConversion(saisie) {
  const brut = TENSION.map((c) => lireNombre(saisie[c]))
  if (brut.some((n) => n == null || Number.isNaN(n))) return null
  if (!brut.some((n) => n < LIMITE_CMHG)) return null
  const ecrit = TENSION.map((c) => String(saisie[c]).trim().replace('.', ','))
  const mm = TENSION.map((c) => lireTension(saisie[c]))
  return `${ecrit.join('/')} cmHg = ${mm.join('/')} mmHg`
}

// Message d'une case que l'on ne comprend pas : jamais de saisie ignorée en silence.
function messageIllisible(mesure, texte) {
  if (TENSION.includes(mesure.cle) && String(texte).includes('/')) {
    return 'Tapez la tension comme 180/110 ou 18/11.'
  }
  return `Tapez un nombre, par exemple ${mesure.exemple}.`
}

const GRAVITE = { alert: 2, warning: 1 }

// Une seule alerte par mesure, la plus grave (à gravité égale, la première renvoyée par la
// base, qui classe déjà les alertes) : jamais « malnutrition modérée » en plus de
// « sévère ». La tension compte pour une seule mesure : systolique et diastolique peuvent
// déclencher deux alertes différentes (« très élevée » et « élevée ») ; seule la plus grave
// reste, avec la valeur : « Tension très élevée · 185/110 ».
export function regrouperAlertes(alertes, systolique, diastolique) {
  const parMesure = new Map()
  for (const a of alertes ?? []) {
    const mesure = TENSION.includes(a.measure) ? 'tension' : a.measure
    const retenue = parMesure.get(mesure)
    if (!retenue || (GRAVITE[a.level] ?? 0) > (GRAVITE[retenue.level] ?? 0)) {
      parMesure.set(mesure, { ...a, measure: mesure })
    }
  }
  const tension = parMesure.get('tension')
  // Valeur affichée seulement si les deux chiffres sont connus : jamais « undefined ».
  if (tension && Number.isFinite(systolique) && Number.isFinite(diastolique)) {
    tension.label = `${tension.label} · ${systolique}/${diastolique}`
  }
  return [...parMesure.values()].sort((a, b) => (GRAVITE[b.level] ?? 0) - (GRAVITE[a.level] ?? 0))
}

export const LIBELLES_MESURES = Object.fromEntries(MESURES.map((m) => [m.cle, m.libelle]))

export const CONSTANTES_VIDES = {
  ...Object.fromEntries(MESURES.map((m) => [m.cle, ''])),
  note: '',
}

// « 37,5 » ou « 37.5 » -> 37.5 ; vide -> null ; illisible -> NaN.
export function lireNombre(texte) {
  const propre = String(texte ?? '')
    .trim()
    .replace(/\s/g, '')
    .replace(',', '.')
  if (!propre) return null
  return /^\d+(\.\d+)?$/.test(propre) ? Number(propre) : Number.NaN
}

// Tension en cours de frappe (« 180/ », « 180/11 ») : répartie à la sortie de la case,
// ni lue ni signalée d'ici là.
function enCoursDeFrappe(cle, texte) {
  return (
    TENSION.includes(cle) &&
    Boolean(separerTension(texte) || /^\s*\d+([.,]\d+)?\s*\/\s*$/.test(texte))
  )
}

const virgule = (n) => String(n).replace('.', ',')

function messageImpossible(mesure, borne) {
  return `Valeur impossible : entre ${virgule(borne.min)} et ${virgule(borne.max)} ${mesure.unite}. Vérifiez la saisie.`
}

// Lecture de la saisie, case par case. bornes : bornes de vraisemblance lues dans la base
// (vital_sign_bounds), jamais recopiées ici.
//   valeurs : mesures lisibles et plausibles seulement ; la tension seulement complète et
//             cohérente (c'est sur elles seules que se calculent les alertes) ;
//   erreurs : message à afficher sous chaque case en cause ;
//   vide    : rien n'est saisi.
export function lireSaisie(saisie, bornes = {}) {
  const valeurs = {}
  const erreurs = {}
  let vide = true
  for (const m of MESURES) {
    const texte = String(saisie[m.cle] ?? '')
    if (texte.trim()) vide = false
    if (enCoursDeFrappe(m.cle, texte)) continue
    const n = TENSION.includes(m.cle) ? lireTension(texte) : lireNombre(texte)
    if (n === null) continue
    if (Number.isNaN(n)) {
      erreurs[m.cle] = messageIllisible(m, texte)
      continue
    }
    const borne = bornes?.[m.cle]
    if (borne && (n < borne.min || n > borne.max)) {
      erreurs[m.cle] = messageImpossible(m, borne)
      continue
    }
    valeurs[m.cle] = n
  }

  // Tension : les deux chiffres, la systolique au-dessus de la diastolique.
  const [sys, dia] = TENSION.map((c) => String(saisie[c] ?? '').trim())
  if (sys && !dia && !enCoursDeFrappe('systolic', sys)) {
    erreurs.diastolic ??= 'Saisissez aussi la diastolique.'
  }
  if (dia && !sys && !enCoursDeFrappe('diastolic', dia)) {
    erreurs.systolic ??= 'Saisissez aussi la systolique.'
  }
  if (
    valeurs.systolic != null &&
    valeurs.diastolic != null &&
    valeurs.systolic <= valeurs.diastolic
  ) {
    erreurs.diastolic = 'La diastolique doit être plus basse que la systolique.'
  }
  if (
    erreurs.systolic ||
    erreurs.diastolic ||
    valeurs.systolic == null ||
    valeurs.diastolic == null
  ) {
    delete valeurs.systolic
    delete valeurs.diastolic
  }

  if (saisie.note?.trim()) valeurs.note = saisie.note.trim()
  return { valeurs, erreurs, vide }
}

// Ce périmètre ne se mesure que dans les tranches d'âge prévues par les seuils de la
// structure (6 à 59 mois par défaut) : le champ n'apparaît que pour elles.
export function mesureApplicable(mesure, seuils, ageMois) {
  if (mesure !== 'muac_mm') return true
  if (ageMois == null) return false
  return seuils.some(
    (s) =>
      s.measure === 'muac_mm' &&
      s.is_active &&
      (s.min_age_months == null || ageMois >= s.min_age_months) &&
      (s.max_age_months == null || ageMois < s.max_age_months),
  )
}

// Âge en mois révolus (même calcul que la base : milieu de l'année si la date manque).
export function ageEnMois(patient, aujourdhui = new Date()) {
  const naissance = patient.birth_date
    ? new Date(patient.birth_date)
    : patient.birth_year
      ? new Date(patient.birth_year, 6, 1)
      : null
  if (!naissance) return null
  let mois =
    (aujourdhui.getFullYear() - naissance.getFullYear()) * 12 +
    (aujourdhui.getMonth() - naissance.getMonth())
  if (aujourdhui.getDate() < naissance.getDate()) mois -= 1
  return Math.max(0, mois)
}

// « Tension élevée : à partir de 140 mmHg, dès 15 ans »
export function libelleSeuil(s) {
  const unite = MESURES.find((m) => m.cle === s.measure)?.unite ?? ''
  const valeur = String(s.below ?? s.at_or_above).replace('.', ',')
  const condition = s.below != null ? `sous ${valeur} ${unite}` : `à partir de ${valeur} ${unite}`
  const age = [
    s.min_age_months != null && `dès ${libelleMois(s.min_age_months)}`,
    s.max_age_months != null && `avant ${libelleMois(s.max_age_months)}`,
  ]
    .filter(Boolean)
    .join(', ')
  return [condition, age].filter(Boolean).join(', ')
}

function libelleMois(mois) {
  return mois % 12 === 0 ? `${mois / 12} an${mois / 12 > 1 ? 's' : ''}` : `${mois} mois`
}

const MESSAGES_CONTRAINTES = {
  vital_signs_weight_kg_check: ['weight_kg', 'Poids impossible : vérifiez la saisie (en kg).'],
  vital_signs_height_cm_check: ['height_cm', 'Taille impossible : vérifiez la saisie (en cm).'],
  vital_signs_temperature_c_check: [
    'temperature_c',
    'Température impossible : vérifiez la saisie (en °C).',
  ],
  vital_signs_systolic_check: ['systolic', 'Systolique impossible : vérifiez la saisie (en mmHg).'],
  vital_signs_diastolic_check: [
    'diastolic',
    'Diastolique impossible : vérifiez la saisie (en mmHg).',
  ],
  vital_signs_bp_order: ['diastolic', 'La diastolique doit être plus basse que la systolique.'],
  vital_signs_bp_pair: ['systolic', 'La tension se note avec ses deux chiffres.'],
  vital_signs_pulse_check: ['pulse', 'Pouls impossible : vérifiez la saisie.'],
  vital_signs_spo2_check: ['spo2', 'Saturation impossible : vérifiez la saisie (en %).'],
  vital_signs_glucose_g_l_check: ['glucose_g_l', 'Glycémie impossible : en g/L (exemple : 1,10).'],
  vital_signs_muac_mm_check: ['muac_mm', 'Périmètre impossible : en millimètres (exemple : 125).'],
  vital_signs_note_check: ['note', 'La note ne doit pas dépasser 300 caractères.'],
}

// Refus d'une contrainte de la base -> { champ, message } ; null si ce n'en est pas un.
export function erreurContrainte(message) {
  const nom = Object.keys(MESSAGES_CONTRAINTES).find((c) => (message ?? '').includes(c))
  if (!nom) return null
  const [champ, texte] = MESSAGES_CONTRAINTES[nom]
  return { champ, message: texte }
}

const nombre = (n) => String(n).replace('.', ',')

// « TA 180/110 · Température 37,2 °C · Poids 68,5 kg »
export function resumeMesure(m) {
  const parties = []
  if (m.systolic != null) parties.push(`TA ${m.systolic}/${m.diastolic}`)
  for (const d of MESURES) {
    if (['systolic', 'diastolic'].includes(d.cle) || m[d.cle] == null) continue
    parties.push(`${d.libelle} ${nombre(m[d.cle])} ${d.unite}`)
  }
  return parties.join(' · ')
}
