import { useContext } from 'react'
import { OrgContexte } from '../context/orgContexte.js'

// const { structure, structures, changerStructure } = useOrganization()
export function useOrganization() {
  const contexte = useContext(OrgContexte)
  if (!contexte)
    throw new Error('useOrganization doit être utilisé à l’intérieur de <OrgProvider>.')
  return contexte
}
