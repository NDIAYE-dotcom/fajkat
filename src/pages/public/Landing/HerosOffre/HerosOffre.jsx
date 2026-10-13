import {
  ArrowLeftRight,
  BedDouble,
  FlaskConical,
  MessageCircle,
  ShieldCheck,
  Ticket,
  Wallet,
} from 'lucide-react'
import Button from '../../../../components/ui/Button/Button.jsx'
import { useOffre } from '../../../../hooks/useOffre.js'
import { autreOffre } from '../../../../lib/offres.js'
import BoutonDemo from '../BoutonDemo/BoutonDemo.jsx'
import './HerosOffre.css'

const ICONES = {
  ticket: Ticket,
  rappel: MessageCircle,
  paiement: Wallet,
  lit: BedDouble,
  labo: FlaskConical,
  prise: ShieldCheck,
}

// En-tête de la page d'une offre : promesse courte, deux boutons, et l'illustration du bâtiment
// entourée de vignettes qui flottent (données fictives, comme dans le parcours plus bas).
export default function HerosOffre({ offre, heros }) {
  const { choisirOffre } = useOffre()
  const autre = autreOffre(offre.type)

  return (
    <section className="heros-offre" aria-labelledby="titre-page">
      <div className="heros-offre__texte">
        <p className="heros-offre__surtitre">{heros.surtitre}</p>
        <h1 id="titre-page" className="heros-offre__titre" tabIndex={-1}>
          {heros.titre}
        </h1>
        <p className="heros-offre__chapeau">{heros.chapeau}</p>
        <div className="heros-offre__actions">
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
      </div>

      <div className="heros-offre__visuel" aria-hidden="true">
        <span className="heros-offre__cercle">
          <img
            className="heros-offre__image"
            src={heros.image}
            alt=""
            width="720"
            height="480"
            decoding="async"
          />
        </span>
        {heros.vignettes.map(({ cle, titre, detail }, rang) => {
          const Icone = ICONES[cle]
          return (
            <span key={cle} className="heros-offre__vignette" style={{ '--rang': rang }}>
              <span className="heros-offre__vignette-icone">
                <Icone size={18} strokeWidth={1.75} />
              </span>
              <span className="heros-offre__vignette-texte">
                <span className="heros-offre__vignette-titre">{titre}</span>
                <span className="heros-offre__vignette-detail">{detail}</span>
              </span>
            </span>
          )
        })}
        <span className="heros-offre__mention">Données fictives</span>
      </div>
    </section>
  )
}
