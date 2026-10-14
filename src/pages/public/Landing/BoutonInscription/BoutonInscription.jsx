import { ArrowRight } from 'lucide-react'
import Button from '../../../../components/ui/Button/Button.jsx'

// « Inscrire ma structure » : bouton secondaire. Tant que le logiciel est en développement,
// la démo reste l'action principale, mais un visiteur décidé peut s'inscrire sans attendre.
export default function BoutonInscription({ offre, taille = 'grande' }) {
  return (
    <Button
      to={`/inscription?offre=${offre.type}`}
      variante="secondaire"
      taille={taille}
      iconeFin={<ArrowRight size={18} />}
    >
      Inscrire ma structure
    </Button>
  )
}
