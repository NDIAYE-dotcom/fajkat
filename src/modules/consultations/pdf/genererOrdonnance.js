// Génération du PDF de l'ordonnance (chargé à la demande avec DocumentOrdonnance).
import { pdf } from '@react-pdf/renderer'
import { createElement } from 'react'
import DocumentOrdonnance from './DocumentOrdonnance.jsx'
import { stylesOrdonnance } from './stylesOrdonnance.js'

// Encre du jeton --impression-encre ; repli si la feuille de style manque : noir, comme à
// l'impression.
function jeton(nom) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(nom).trim()
  return v || 'black'
}

// Logo de la structure en PNG : le PDF ne lit ni le WebP ni une image d'une autre origine
// sans CORS. En cas d'échec, l'ordonnance part sans logo.
async function logoEnPng(url) {
  if (!url) return null
  try {
    const img = new window.Image()
    img.crossOrigin = 'anonymous'
    img.src = url
    await img.decode()
    const toile = document.createElement('canvas')
    toile.width = img.naturalWidth
    toile.height = img.naturalHeight
    toile.getContext('2d').drawImage(img, 0, 0)
    return toile.toDataURL('image/png')
  } catch {
    return null
  }
}

// d : { structure: { name, address, phone, authorization_number, logo_url },
//       patient: { nom, age }, date,
//       ordonnance: { items, note, prescriber_name, prescriber_title },
//       voies, libelles: { matin, midi, soir, nuit } } -> Blob PDF.
export async function genererOrdonnance(d) {
  const encre = jeton('--impression-encre')
  const logo = await logoEnPng(d.structure.logo_url)
  const donnees = { ...d, structure: { ...d.structure, logo } }
  return pdf(
    createElement(DocumentOrdonnance, { d: donnees, s: stylesOrdonnance(encre), encre }),
  ).toBlob()
}
