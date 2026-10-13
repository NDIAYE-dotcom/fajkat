// Préparation des illustrations SVG chargées en texte brut (import '…svg?raw').
// Les fichiers peuvent être remplacés par des exports Illustrator : on les nettoie
// avant de les insérer dans la page, pour qu'ils n'apportent ni script ni style global.
// Convention des fichiers : voir docs/illustrations.md.

const BALISES_RETIREES = ['script', 'style', 'foreignObject', 'metadata', 'title', 'desc']

// Éléments dont le tracé est animé « à la main ».
export const SELECTEUR_TRAITS = 'path, line, polyline, polygon, rect, circle, ellipse'

function versUrlInterne(valeur, prefixe) {
  return valeur.replace(/url\(\s*['"]?#([^'")\s]+)['"]?\s*\)/g, `url(#${prefixe}-$1)`)
}

// Retourne le balisage SVG nettoyé, ou une chaîne vide si le fichier est illisible.
// Les id sont préfixés pour rester uniques dans la page ; l'id d'origine est conservé
// dans data-element, et les id réservés deviennent des attributs :
//   id="zone"         -> data-zone   (contour teinté au survol)
//   id="piece-<code>" -> data-piece="<code>" (pièce d'un plan de bâtiment)
export function preparerIllustration(source, prefixe) {
  if (typeof DOMParser === 'undefined') return ''
  const document = new DOMParser().parseFromString(source, 'image/svg+xml')
  const svg = document.documentElement
  if (svg.nodeName !== 'svg' || document.querySelector('parsererror')) return ''

  for (const balise of BALISES_RETIREES) {
    document.querySelectorAll(balise).forEach((noeud) => noeud.remove())
  }

  // La taille est pilotée par le CSS ; seul le viewBox compte.
  svg.removeAttribute('width')
  svg.removeAttribute('height')
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('focusable', 'false')

  for (const element of [svg, ...svg.querySelectorAll('*')]) {
    for (const { name, value } of [...element.attributes]) {
      const nom = name.toLowerCase()
      // Les classes et styles d'Illustrator dépendent d'un <style> retiré : on les ignore.
      if (nom.startsWith('on') || nom === 'style' || nom === 'class') {
        element.removeAttribute(name)
      } else if (nom === 'href' || nom === 'xlink:href') {
        if (value.startsWith('#')) element.setAttribute(name, `#${prefixe}-${value.slice(1)}`)
        else element.removeAttribute(name)
      } else if (value.includes('url(')) {
        element.setAttribute(name, versUrlInterne(value, prefixe))
      }
    }

    const id = element.getAttribute('id')
    if (!id) continue
    if (id === 'zone') element.setAttribute('data-zone', '')
    else if (id.startsWith('piece-')) element.setAttribute('data-piece', id.slice(6))
    element.setAttribute('data-element', id)
    element.setAttribute('id', `${prefixe}-${id}`)
  }

  return new XMLSerializer().serializeToString(svg)
}
