// Socle des documents imprimés en PDF (ordonnance, lettre de référence, certificat) :
// polices, encre, logo, génération. Chargé à la demande avec les documents : la
// bibliothèque reste hors des pages courantes.
import { Font, pdf } from '@react-pdf/renderer'
import atkinson400 from '@fontsource/atkinson-hyperlegible/files/atkinson-hyperlegible-latin-400-normal.woff?url'
import atkinson700 from '@fontsource/atkinson-hyperlegible/files/atkinson-hyperlegible-latin-700-normal.woff?url'
import plex600 from '@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-600-normal.woff?url'
import spectral600 from '@fontsource/spectral/files/spectral-latin-600-normal.woff?url'
import { createElement } from 'react'

Font.register({
  family: 'Atkinson',
  fonts: [{ src: atkinson400 }, { src: atkinson700, fontWeight: 700 }],
})
Font.register({ family: 'Plex', src: plex600 })
Font.register({ family: 'Spectral', src: spectral600 })
// Aucun mot coupé en fin de ligne.
Font.registerHyphenationCallback((mot) => [mot])

// Encre du jeton --impression-encre ; repli si la feuille de style manque : noir, comme à
// l'impression.
export function jeton(nom) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(nom).trim()
  return v || 'black'
}

// Logo de la structure en PNG : le PDF ne lit ni le WebP ni une image d'une autre origine
// sans CORS. En cas d'échec, le document part sans logo.
export async function logoEnPng(url) {
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

// Document(d, s, encre) -> Blob PDF. d.structure.logo_url est converti en PNG.
export async function genererPdf(Document, d, styles) {
  const encre = jeton('--impression-encre')
  const logo = await logoEnPng(d.structure?.logo_url)
  const donnees = { ...d, structure: { ...d.structure, logo } }
  return pdf(createElement(Document, { d: donnees, s: styles(encre), encre })).toBlob()
}
