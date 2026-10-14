// Impression d'un seul élément de l'écran (un reçu, une ordonnance) sans le reste de l'interface.
// Les règles de mise en page sont dans src/styles/print.css.

const FORMATS = ['a4', 'a5', 'ticket']

// Le format se déduit de la classe de l'élément : .ticket-80, .impression-a5, sinon A4.
function formatDe(element) {
  if (element.classList.contains('ticket-80')) return 'ticket'
  if (element.classList.contains('impression-a5')) return 'a5'
  return 'a4'
}

export function imprimer(element, format) {
  if (!element) return
  const racine = document.documentElement
  const choisi = FORMATS.includes(format) ? format : formatDe(element)

  element.setAttribute('data-imprime', '')
  racine.setAttribute('data-impression', choisi)

  const nettoyer = () => {
    element.removeAttribute('data-imprime')
    racine.removeAttribute('data-impression')
    window.removeEventListener('afterprint', nettoyer)
  }
  window.addEventListener('afterprint', nettoyer)
  window.print()
}
