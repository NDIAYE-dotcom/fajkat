import { useSearchParams } from 'react-router-dom'

// Page demandée avant la connexion (?retour=/app/…). Seules les adresses de l'application
// sont acceptées : un lien piégé ne peut pas renvoyer vers un autre site.
export function useRetourApresConnexion() {
  const [parametres] = useSearchParams()
  const retour = parametres.get('retour')
  return retour && /^\/app(\/|\?|$)/.test(retour) ? retour : '/app'
}
