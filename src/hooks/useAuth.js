import { useContext } from 'react'
import { AuthContexte } from '../context/authContexte.js'

// const { session, utilisateur, prenom, initialise, deconnecter } = useAuth()
export function useAuth() {
  const contexte = useContext(AuthContexte)
  if (!contexte) throw new Error('useAuth doit être utilisé à l’intérieur de <AuthProvider>.')
  return contexte
}
