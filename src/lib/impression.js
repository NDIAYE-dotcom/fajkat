// Impression d'un seul élément de l'écran (un reçu, une ordonnance) sans le reste de l'interface.
// Les règles de mise en page sont dans src/styles/print.css.

const FORMATS = ['a4', 'a4-paysage', 'a5', 'ticket']

// Marge de sécurité ajoutée à la hauteur mesurée du ticket (coupe du papier comprise).
const MARGE_TICKET_MM = 12
const MM_PAR_PIXEL = 25.4 / 96

// Le format se déduit de la classe de l'élément : .ticket-80, .impression-a5,
// .impression-a4-paysage, sinon A4.
function formatDe(element) {
  if (element.classList.contains('ticket-80')) return 'ticket'
  if (element.classList.contains('impression-a4-paysage')) return 'a4-paysage'
  if (element.classList.contains('impression-a5')) return 'a5'
  return 'a4'
}

// Hauteur de l'élément tel qu'affiché. Une copie réservée à l'impression (.impression-seule)
// est masquée à l'écran et mesurerait 0 : on l'affiche hors champ, le temps de la mesure.
function hauteurPx(element) {
  if (element.getClientRects().length > 0) return element.scrollHeight
  const style = element.getAttribute('style')
  element.style.cssText +=
    ';display:block!important;position:absolute;left:-10000px;top:0;visibility:hidden'
  const hauteur = element.scrollHeight
  if (style === null) element.removeAttribute('style')
  else element.setAttribute('style', style)
  return hauteur
}

// Page du ticket à sa hauteur réelle : le rouleau ne déroule que ce qui est imprimé, en une
// seule bande (ticket de file, puis reçu éventuel). Mesure faite à l'écran, où le ticket
// est un peu plus grand qu'imprimé : marge suffisante.
function styleTicket(element) {
  const hauteur = Math.ceil(hauteurPx(element) * MM_PAR_PIXEL) + MARGE_TICKET_MM
  const style = document.createElement('style')
  style.textContent = `@media print { @page ticket { size: 80mm ${hauteur}mm; margin: 0; } }`
  document.head.append(style)
  return style
}

export function imprimer(element, format) {
  if (!element) return
  const racine = document.documentElement
  const choisi = FORMATS.includes(format) ? format : formatDe(element)

  // Les ascendants restent affichés ; tout le reste est retiré de l'impression (print.css).
  const chemin = []
  for (let parent = element.parentElement; parent && parent !== document.body;) {
    parent.setAttribute('data-imprime-chemin', '')
    chemin.push(parent)
    parent = parent.parentElement
  }
  element.setAttribute('data-imprime', '')
  racine.setAttribute('data-impression', choisi)
  const style = choisi === 'ticket' ? styleTicket(element) : null

  const nettoyer = () => {
    chemin.forEach((parent) => parent.removeAttribute('data-imprime-chemin'))
    element.removeAttribute('data-imprime')
    racine.removeAttribute('data-impression')
    style?.remove()
    window.removeEventListener('afterprint', nettoyer)
  }
  window.addEventListener('afterprint', nettoyer)
  window.print()
}
