// Recadrage carré et compression du logo, sans bibliothèque : un <canvas> suffit.

export const TAILLE_LOGO = 512 // pixels : net à l'impression d'un en-tête A4, léger à envoyer
const QUALITE = 0.85

// Échelle et position de l'image dans le carré. decalage en pixels du carré de sortie ;
// il est borné pour que l'image couvre toujours tout le carré.
export function geometrie(image, zoom, decalage) {
  const echelle =
    Math.max(TAILLE_LOGO / image.naturalWidth, TAILLE_LOGO / image.naturalHeight) * zoom
  const largeur = image.naturalWidth * echelle
  const hauteur = image.naturalHeight * echelle
  const maxX = (largeur - TAILLE_LOGO) / 2
  const maxY = (hauteur - TAILLE_LOGO) / 2
  const x = Math.min(maxX, Math.max(-maxX, decalage.x))
  const y = Math.min(maxY, Math.max(-maxY, decalage.y))
  return {
    largeur,
    hauteur,
    decalage: { x, y },
    gauche: (TAILLE_LOGO - largeur) / 2 + x,
    haut: (TAILLE_LOGO - hauteur) / 2 + y,
  }
}

// fond : couleur sous les zones transparentes (un logo PNG détouré reste lisible en JPEG).
export function dessiner(canvas, image, zoom, decalage, fond) {
  const contexte = canvas.getContext('2d')
  const g = geometrie(image, zoom, decalage)
  contexte.fillStyle = fond
  contexte.fillRect(0, 0, TAILLE_LOGO, TAILLE_LOGO)
  contexte.imageSmoothingQuality = 'high'
  contexte.drawImage(image, g.gauche, g.haut, g.largeur, g.hauteur)
}

function versBlob(canvas, type) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, QUALITE))
}

// WebP si le navigateur sait l'encoder, sinon JPEG (anciens Safari renvoient du PNG).
export async function exporter(image, zoom, decalage, fond) {
  const canvas = document.createElement('canvas')
  canvas.width = TAILLE_LOGO
  canvas.height = TAILLE_LOGO
  dessiner(canvas, image, zoom, decalage, fond)
  const webp = await versBlob(canvas, 'image/webp')
  if (webp?.type === 'image/webp') return webp
  const jpeg = await versBlob(canvas, 'image/jpeg')
  if (!jpeg) throw new Error('L’image n’a pas pu être préparée. Essayez une autre photo.')
  return jpeg
}

export function chargerImage(fichier) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(fichier)
    const image = new Image()
    image.onload = () => resolve({ image, url })
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Ce fichier n’est pas une image lisible. Choisissez une photo JPG ou PNG.'))
    }
    image.src = url
  })
}
