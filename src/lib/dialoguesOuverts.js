// Pile des <dialog> modaux ouverts (Modal, Drawer), tenue par useDialogue.
// La zone des notifications s'installe dans le dialogue du dessus : un dialogue modal rend
// le reste de la page inerte (ni cliquable ni annoncé), un message d'erreur y serait caché.

let pile = []
const abonnes = new Set()

function prevenir() {
  abonnes.forEach((rappel) => rappel())
}

export function empilerDialogue(element) {
  pile = [...pile, element]
  prevenir()
}

export function retirerDialogue(element) {
  pile = pile.filter((d) => d !== element)
  prevenir()
}

export function abonnerDialogues(rappel) {
  abonnes.add(rappel)
  return () => abonnes.delete(rappel)
}

export function dialogueDuDessus() {
  return pile[pile.length - 1] ?? null
}
