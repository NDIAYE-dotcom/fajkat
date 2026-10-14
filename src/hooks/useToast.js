import { useContext } from 'react'
import { ToastContexte } from '../components/ui/Toast/toastContexte.js'

// const toast = useToast()
// toast.succes('Patient enregistré')
// toast.erreur('Connexion perdue', { message: 'Votre saisie est conservée.', action: { libelle: 'Réessayer', onClick } })
export function useToast() {
  const contexte = useContext(ToastContexte)
  if (!contexte) throw new Error('useToast doit être utilisé sous <ToastProvider>.')
  return contexte
}
