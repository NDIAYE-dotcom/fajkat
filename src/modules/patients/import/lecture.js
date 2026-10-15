// Lecture d'un fichier d'import dans le navigateur : Excel (.xlsx, avec exceljs chargé à
// la demande) ou CSV (séparateur « ; », « , » ou tabulation ; UTF-8 ou Windows-1252, les
// deux encodages d'Excel). Rien ne quitte l'appareil à cette étape.
//
// Résultat : { entetes, lignes: [{ numero, brut, valeurs }], inconnues, manquantes }
//   numero  : numéro de la ligne dans le fichier (comme dans Excel) ;
//   brut    : cellules telles que lues (fichier des lignes refusées) ;
//   valeurs : { cle de colonne: texte }.

import { COLONNES, colonneDeLEntete } from './colonnes.js'

export const TAILLE_MAX = 5 * 1024 * 1024 // octets
export const LIGNES_MAX = 5000

function erreur(message) {
  return new Error(message)
}

// --- Excel ---------------------------------------------------------------------

const deux = (n) => String(n).padStart(2, '0')

// Excel range les dates en jours ; exceljs les rend en Date « UTC » : lire les parties UTC.
function dateExcel(d) {
  return `${d.getUTCFullYear()}-${deux(d.getUTCMonth() + 1)}-${deux(d.getUTCDate())}`
}

function texteCellule(valeur) {
  if (valeur === null || valeur === undefined) return ''
  if (valeur instanceof Date) return Number.isNaN(valeur.getTime()) ? '' : dateExcel(valeur)
  if (typeof valeur === 'number') return Number.isFinite(valeur) ? String(valeur) : ''
  if (typeof valeur === 'boolean') return valeur ? 'oui' : 'non'
  if (typeof valeur === 'object') {
    if (Array.isArray(valeur.richText))
      return valeur.richText
        .map((r) => r.text)
        .join('')
        .trim()
    if ('result' in valeur) return texteCellule(valeur.result)
    if ('text' in valeur) return texteCellule(valeur.text)
    return ''
  }
  return String(valeur).trim()
}

async function lireExcel(fichier) {
  const { default: ExcelJS } = await import('exceljs')
  const classeur = new ExcelJS.Workbook()
  try {
    await classeur.xlsx.load(await fichier.arrayBuffer())
  } catch {
    throw erreur(
      'Ce fichier Excel n’a pas pu être ouvert. Vérifiez qu’il n’est pas protégé par un mot de passe, puis enregistrez-le de nouveau en .xlsx.',
    )
  }
  const feuille =
    classeur.worksheets.find((f) => f.state === 'visible' && f.actualRowCount > 0) ??
    classeur.worksheets[0]
  if (!feuille) throw erreur('Le fichier ne contient aucune feuille.')
  const rangees = []
  feuille.eachRow({ includeEmpty: false }, (rangee, numero) => {
    // rangee.values commence à l'indice 1 (colonne A).
    rangees.push({ numero, cellules: rangee.values.slice(1).map(texteCellule) })
  })
  return rangees
}

// --- CSV -----------------------------------------------------------------------

function decoder(tampon) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(tampon)
  } catch {
    // Excel sous Windows enregistre souvent le CSV en Windows-1252.
    return new TextDecoder('windows-1252').decode(tampon)
  }
}

// Séparateur le plus fréquent sur la première ligne, hors guillemets.
function separateur(texte) {
  const premiere = texte.split(/\r?\n/, 1)[0].replace(/"[^"]*"/g, '')
  const compte = (c) => premiere.split(c).length - 1
  return [';', ',', '\t'].reduce((meilleur, c) => (compte(c) > compte(meilleur) ? c : meilleur))
}

// Analyse RFC 4180 : guillemets, guillemets doublés, retours à la ligne dans une cellule.
function analyserCsv(texte, sep) {
  const rangees = []
  let cellules = []
  let cellule = ''
  let entreGuillemets = false
  let numero = 1
  let debut = 1
  for (let i = 0; i < texte.length; i += 1) {
    const c = texte[i]
    if (entreGuillemets) {
      if (c === '"' && texte[i + 1] === '"') {
        cellule += '"'
        i += 1
      } else if (c === '"') {
        entreGuillemets = false
      } else {
        if (c === '\n') numero += 1
        cellule += c
      }
    } else if (c === '"') {
      entreGuillemets = true
    } else if (c === sep) {
      cellules.push(cellule.trim())
      cellule = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && texte[i + 1] === '\n') i += 1
      cellules.push(cellule.trim())
      if (cellules.some(Boolean)) rangees.push({ numero: debut, cellules })
      cellules = []
      cellule = ''
      numero += 1
      debut = numero
    } else {
      cellule += c
    }
  }
  cellules.push(cellule.trim())
  if (cellules.some(Boolean)) rangees.push({ numero: debut, cellules })
  return rangees
}

async function lireCsv(fichier) {
  const texte = decoder(await fichier.arrayBuffer()).replace(/^\uFEFF/, '')
  return analyserCsv(texte, separateur(texte))
}

// --- Commun --------------------------------------------------------------------

// Ligne d'en-tête : la première des 10 premières lignes qui nomme au moins deux colonnes
// connues (un titre ou une ligne vide peut précéder le tableau).
function trouverEntete(rangees) {
  return rangees
    .slice(0, 10)
    .findIndex((r) => r.cellules.filter((c) => colonneDeLEntete(c)).length >= 2)
}

export async function lireFichier(fichier) {
  const nom = fichier.name.toLowerCase()
  if (nom.endsWith('.xls')) {
    throw erreur(
      'Ancien format Excel (.xls). Ouvrez le fichier dans Excel, puis « Enregistrer sous » au format Classeur Excel (.xlsx).',
    )
  }
  if (!nom.endsWith('.xlsx') && !nom.endsWith('.csv')) {
    throw erreur('Choisissez un fichier Excel (.xlsx) ou CSV (.csv).')
  }
  if (fichier.size > TAILLE_MAX) {
    throw erreur('Fichier trop lourd (5 Mo au plus). Découpez-le en plusieurs fichiers.')
  }

  const rangees = nom.endsWith('.xlsx') ? await lireExcel(fichier) : await lireCsv(fichier)
  const indexEntete = trouverEntete(rangees)
  if (indexEntete === -1) {
    throw erreur(
      'Les colonnes n’ont pas été reconnues. Utilisez le modèle, ou nommez au moins les colonnes « Nom » et « Prénom » sur la première ligne.',
    )
  }

  const entetes = rangees[indexEntete].cellules
  const cles = entetes.map((e) => colonneDeLEntete(e))
  // Deux colonnes reconnues pour la même donnée : seule la première est lue.
  const vues = new Set()
  const utiles = cles.map((cle) => {
    if (!cle || vues.has(cle)) return null
    vues.add(cle)
    return cle
  })

  const manquantes = COLONNES.filter((c) => c.requis && !vues.has(c.cle)).map((c) => c.titre)
  if (manquantes.length) {
    throw erreur(`Colonnes obligatoires absentes : ${manquantes.join(', ')}.`)
  }

  const lignes = rangees
    .slice(indexEntete + 1)
    .map((r) => {
      const valeurs = {}
      utiles.forEach((cle, i) => {
        if (cle) valeurs[cle] = r.cellules[i] ?? ''
      })
      return { numero: r.numero, brut: entetes.map((_, i) => r.cellules[i] ?? ''), valeurs }
    })
    // Lignes sans aucune valeur (mise en forme seule, lignes de séparation) : ignorées.
    .filter((l) => Object.values(l.valeurs).some(Boolean))
  if (lignes.length === 0) throw erreur('Le fichier ne contient aucune ligne de patient.')
  if (lignes.length > LIGNES_MAX) {
    throw erreur(
      `Le fichier compte ${lignes.length} lignes : ${LIGNES_MAX} au plus par import. Découpez-le en plusieurs fichiers.`,
    )
  }

  return {
    entetes,
    lignes,
    inconnues: entetes.filter((e, i) => e && !cles[i]),
  }
}
