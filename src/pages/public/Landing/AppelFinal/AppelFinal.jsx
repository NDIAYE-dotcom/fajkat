import { ArrowLeftRight } from 'lucide-react'
import Button from '../../../../components/ui/Button/Button.jsx'
import { useApparition } from '../../../../hooks/useApparition.js'
import { useOffre } from '../../../../hooks/useOffre.js'
import { autreOffre } from '../../../../lib/offres.js'
import BoutonDemo from '../BoutonDemo/BoutonDemo.jsx'
import './AppelFinal.css'

// Dernière section d'une page d'offre, dans le style des cartes de l'écran de choix :
// demande de démo, ou passage direct à l'autre offre.
export default function AppelFinal({ titre, questionAutre, image }) {
  const { offre, choisirOffre } = useOffre()
  const autre = autreOffre(offre.type)
  const [ref, apparu] = useApparition()

  return (
    <section
      ref={ref}
      className="appel-final"
      data-apparu={apparu || undefined}
      aria-labelledby="appel-final-titre"
    >
      <div className="appel-final__carte apparition">
        {/* Fond dégradé et illustration, découpés aux coins de la carte */}
        <span className="appel-final__feuille" aria-hidden="true">
          <span className="appel-final__cercle">
            <img
              className="appel-final__image"
              src={image}
              alt=""
              width="720"
              height="480"
              decoding="async"
            />
          </span>
        </span>

        <div className="appel-final__contenu">
          <p className="appel-final__surtitre apparition" style={{ '--rang': 1 }}>
            Offre {offre.nom}
          </p>
          <h2
            id="appel-final-titre"
            className="appel-final__titre apparition"
            style={{ '--rang': 2 }}
          >
            {titre}
          </h2>
          <div className="appel-final__actions apparition" style={{ '--rang': 3 }}>
            <BoutonDemo offre={offre} taille="grande" />
            <Button
              variante="secondaire"
              taille="grande"
              onClick={() => choisirOffre(autre.type, { transition: true })}
              iconeFin={<ArrowLeftRight size={18} />}
            >
              Voir l’offre {autre.nom}
            </Button>
          </div>
          <p className="appel-final__question apparition" style={{ '--rang': 4 }}>
            {questionAutre}
          </p>
        </div>
      </div>
    </section>
  )
}
