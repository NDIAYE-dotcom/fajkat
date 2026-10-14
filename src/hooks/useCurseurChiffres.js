import { useImperativeHandle, useLayoutEffect, useRef } from 'react'

// Champs reformatés pendant la saisie (téléphone « 77 123 45 67 », montant « 12 500 ») :
// sans précaution, chaque espace ajoutée renvoie le curseur en fin de champ.
// On retient combien de chiffres précèdent le curseur, puis on le replace après le reformatage.
export function useCurseurChiffres(refExterne) {
  const champ = useRef(null)
  const chiffresAvant = useRef(null)

  // La ref transmise par le parent (react-hook-form, focus sur erreur) pointe sur le même champ.
  useImperativeHandle(refExterne, () => champ.current)

  function memoriser(evenement) {
    const { value, selectionStart } = evenement.target
    chiffresAvant.current = value.slice(0, selectionStart ?? value.length).replace(/\D/g, '').length
  }

  // Sans dépendances : s'exécute après chaque rendu, y compris quand la valeur n'a pas changé.
  useLayoutEffect(() => {
    const noeud = champ.current
    if (!noeud || chiffresAvant.current === null || document.activeElement !== noeud) return
    const texte = noeud.value
    let restants = chiffresAvant.current
    let position = 0
    while (position < texte.length && restants > 0) {
      if (/\d/.test(texte[position])) restants -= 1
      position += 1
    }
    noeud.setSelectionRange(position, position)
    chiffresAvant.current = null
  })

  return { ref: champ, memoriser }
}
