import { useEffect, useRef } from 'react'

const FOCALISABLES = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

// Nombre de dialogues ouverts : le défilement de la page reste bloqué tant qu'il en reste un.
let ouverts = 0

// Fenêtre modale sur <dialog> (Modal, Drawer), pilotée par « ouvert » :
// - showModal() rend le reste de la page inerte ; Tab boucle à l'intérieur du dialogue ;
// - Échap et le clic sur le voile appellent onFermer (le parent décide de fermer) ;
// - à la fermeture, le focus revient sur l'élément qui a ouvert le dialogue.
// Le contenu reste monté une fois fermé : une saisie en cours n'est jamais perdue.
export function useDialogue({ ouvert, onFermer, fermerSurVoile = true }) {
  const ref = useRef(null)
  const declencheur = useRef(null)
  const fermer = useRef(onFermer)

  useEffect(() => {
    fermer.current = onFermer
  })

  useEffect(() => {
    const dialogue = ref.current
    if (!dialogue || !ouvert || dialogue.open) return undefined

    declencheur.current = document.activeElement
    dialogue.showModal()
    ouverts += 1
    document.documentElement.style.overflow = 'hidden'

    return () => {
      if (dialogue.open) dialogue.close()
      ouverts -= 1
      if (ouverts === 0) document.documentElement.style.overflow = ''
      declencheur.current?.focus?.()
    }
  }, [ouvert])

  useEffect(() => {
    const dialogue = ref.current
    if (!dialogue) return undefined
    // Échap : on empêche la fermeture native pour que l'état React reste la seule source.
    function surAnnulation(evenement) {
      evenement.preventDefault()
      fermer.current?.()
    }
    // Certains navigateurs ferment quand même au second Échap : on resynchronise l'état.
    // (« close » est asynchrone : on vérifie que le dialogue n'a pas été rouvert entre-temps.)
    function surFermeture() {
      if (!dialogue.open) fermer.current?.()
    }
    dialogue.addEventListener('cancel', surAnnulation)
    dialogue.addEventListener('close', surFermeture)
    return () => {
      dialogue.removeEventListener('cancel', surAnnulation)
      dialogue.removeEventListener('close', surFermeture)
    }
  }, [])

  function onClick(evenement) {
    if (fermerSurVoile && evenement.target === ref.current) fermer.current?.()
  }

  // Focus piégé : Tab sur le dernier élément revient au premier, Maj+Tab l'inverse.
  function onKeyDown(evenement) {
    if (evenement.key !== 'Tab') return
    const elements = [...ref.current.querySelectorAll(FOCALISABLES)].filter(
      (el) => el.getClientRects().length > 0,
    )
    if (elements.length === 0) return
    const premier = elements[0]
    const dernier = elements[elements.length - 1]
    if (evenement.shiftKey && document.activeElement === premier) {
      evenement.preventDefault()
      dernier.focus()
    } else if (!evenement.shiftKey && document.activeElement === dernier) {
      evenement.preventDefault()
      premier.focus()
    }
  }

  return { ref, onClick, onKeyDown }
}
