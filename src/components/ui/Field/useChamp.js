import { createContext, useContext } from 'react'

// Contexte fourni par <Field> : chaque champ qu'il enveloppe récupère son id,
// les ids de l'aide et de l'erreur (aria-describedby), l'état invalide et « requis ».
export const ChampContexte = createContext(null)

// Fusionne les attributs d'accessibilité du Field avec ceux passés directement au champ.
export function useChamp({ id, invalide, required, ...props } = {}) {
  const champ = useContext(ChampContexte)
  const decritPar = [champ?.decritPar, props['aria-describedby']].filter(Boolean).join(' ')
  const estInvalide = Boolean(invalide ?? champ?.invalide)
  return {
    ...props,
    id: id ?? champ?.id,
    required: required ?? champ?.requis,
    'aria-describedby': decritPar || undefined,
    'aria-invalid': estInvalide || undefined,
    invalide: estInvalide,
  }
}
