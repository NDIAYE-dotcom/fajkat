import { ArrowRight } from 'lucide-react'
import Button from '../../../../components/ui/Button/Button.jsx'
import { useOffre } from '../../../../hooks/useOffre.js'
import { getOffre, prixOffreParMois } from '../../../../lib/offres.js'
import './AppelFinal.css'

// Dernière section d'une page d'offre : rappel du tarif et passage direct à l'autre offre.
export default function AppelFinal({ titre, autreType, questionAutre }) {
  const { offre, choisirOffre } = useOffre()
  const autre = getOffre(autreType)

  return (
    <section className="appel-final" aria-labelledby="appel-final-titre">
      <div className="appel-final__interieur">
        <div className="appel-final__texte">
          <h2 id="appel-final-titre" className="appel-final__titre">
            {titre}
          </h2>
          <p className="appel-final__rappel">
            Offre {offre.nom}&nbsp;:{' '}
            <span className="appel-final__prix">{prixOffreParMois(offre)}</span>
          </p>
        </div>
        <Button
          to={`/inscription?offre=${offre.type}`}
          taille="grande"
          iconeFin={<ArrowRight size={18} />}
        >
          Inscrire ma structure
        </Button>
      </div>

      {autre && (
        <p className="appel-final__autre">
          {questionAutre}{' '}
          <Button
            variante="discret"
            data-offre={autre.type}
            onClick={() => choisirOffre(autre.type)}
          >
            Voir l’offre {autre.nom} ({prixOffreParMois(autre)})
          </Button>
        </p>
      )}
    </section>
  )
}
