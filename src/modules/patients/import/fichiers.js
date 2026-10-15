// Fichiers Excel produits par l'import : le modèle à remplir, et le fichier des lignes
// refusées (colonnes d'origine + « Raison ») à corriger puis importer de nouveau.
// exceljs est chargé à la demande : il ne pèse que sur cette page.

import { COLONNES } from './colonnes.js'

// Couleurs du classeur Excel (format ARGB) : reprises de la palette (--surface, --encre).
// Un fichier Excel ne lit pas les variables CSS.
const FOND_ENTETE = 'FFD9F5EF'
const ENCRE = 'FF17302C'

async function nouveauClasseur() {
  const { default: ExcelJS } = await import('exceljs')
  const classeur = new ExcelJS.Workbook()
  classeur.creator = 'Fajkat'
  classeur.created = new Date()
  return classeur
}

function styliserEntete(feuille) {
  const entete = feuille.getRow(1)
  entete.font = { bold: true, color: { argb: ENCRE } }
  entete.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FOND_ENTETE } }
  entete.alignment = { vertical: 'middle', wrapText: true }
  entete.height = 32
  feuille.views = [{ state: 'frozen', ySplit: 1 }]
}

export function telecharger(blob, nom) {
  const url = URL.createObjectURL(blob)
  const lien = document.createElement('a')
  lien.href = url
  lien.download = nom
  document.body.append(lien)
  lien.click()
  lien.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

async function versBlob(classeur) {
  const tampon = await classeur.xlsx.writeBuffer()
  return new Blob([tampon], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

// Modèle : feuille « Patients » (en-têtes et une ligne d'exemple, colonnes de dates,
// de téléphones et de numéros en texte pour qu'Excel ne les transforme pas) et feuille
// « Consignes ».
export async function telechargerModele() {
  const classeur = await nouveauClasseur()
  const feuille = classeur.addWorksheet('Patients')
  feuille.columns = COLONNES.map((c) => ({
    header: c.titre,
    key: c.cle,
    width: Math.max(14, Math.min(34, c.titre.length + 4)),
    style: c.texte ? { numFmt: '@' } : {},
  }))
  feuille.addRow(Object.fromEntries(COLONNES.map((c) => [c.cle, c.exemple])))
  styliserEntete(feuille)

  const consignes = classeur.addWorksheet('Consignes')
  consignes.columns = [
    { header: 'Colonne', key: 'titre', width: 36 },
    { header: 'Comment la remplir', key: 'consigne', width: 90 },
  ]
  consignes.addRows(COLONNES.map((c) => ({ titre: c.titre, consigne: c.consigne })))
  consignes.addRow({})
  consignes.addRow({
    titre: 'À savoir',
    consigne:
      'Remplacez la ligne d’exemple par vos patients, une ligne par patient. Gardez la première ligne (les titres). Fichier .xlsx ou .csv, 5 000 lignes au plus.',
  })
  consignes.getColumn('consigne').alignment = { wrapText: true, vertical: 'top' }
  styliserEntete(consignes)

  telecharger(await versBlob(classeur), 'fajkat-modele-import-patients.xlsx')
}

// Lignes refusées : colonnes du fichier d'origine, puis « N° de ligne » et « Raison ».
// Les doublons laissés de côté sont dans une seconde feuille, avec le dossier existant.
export async function telechargerRefus({ nomFichier, entetes, refusees, ignorees }) {
  const classeur = await nouveauClasseur()

  const feuille = classeur.addWorksheet('Lignes refusées')
  feuille.addRow([...entetes, 'N° de ligne', 'Raison'])
  for (const l of refusees) feuille.addRow([...l.brut, l.numero, l.raison])
  feuille.columns.forEach((colonne) => {
    colonne.width = 18
  })
  feuille.getColumn(entetes.length + 2).width = 60
  styliserEntete(feuille)

  if (ignorees.length) {
    const doublons = classeur.addWorksheet('Doublons ignorés')
    doublons.addRow([...entetes, 'N° de ligne', 'Dossier proche'])
    for (const l of ignorees) doublons.addRow([...l.brut, l.numero, l.raison])
    doublons.columns.forEach((colonne) => {
      colonne.width = 18
    })
    doublons.getColumn(entetes.length + 2).width = 60
    styliserEntete(doublons)
  }

  const base = nomFichier.replace(/\.(xlsx|csv)$/i, '')
  telecharger(await versBlob(classeur), `${base}-lignes-refusees.xlsx`)
}
