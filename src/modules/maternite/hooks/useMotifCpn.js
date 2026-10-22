import { useEffect, useRef } from 'react'

// Motif d'une CPN pré-rempli « Suivi de grossesse — CPN n », une seule fois et seulement
// s'il est vide (le motif de la file, s'il y en a un, est gardé) ; il reste modifiable.
//   actif : consultation CPN en brouillon, modifiable ; numero : numéro que portera la CPN.
export function useMotifCpn(actif, numero, motif, setMotif) {
  const fait = useRef(false)
  useEffect(() => {
    if (fait.current || !actif || !numero) return
    fait.current = true
    if (!String(motif ?? '').trim()) setMotif(`Suivi de grossesse — CPN ${numero}`)
  }, [actif, numero, motif, setMotif])
}
