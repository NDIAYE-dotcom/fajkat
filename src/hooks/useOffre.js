import { useContext } from 'react'
import { OffreContext } from '../context/offreContexte.js'

export function useOffre() {
  const contexte = useContext(OffreContext)
  if (!contexte) {
    throw new Error('useOffre doit être utilisé à l’intérieur de <OffreProvider>.')
  }
  return contexte
}
