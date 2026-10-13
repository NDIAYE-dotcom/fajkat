import Button from '../../../../components/ui/Button/Button.jsx'
import BoutonDemo from '../BoutonDemo/BoutonDemo.jsx'
import './AppelDemo.css'

// Appel à la démo au milieu de la page, juste après le parcours.
export default function AppelDemo({ offre }) {
  return (
    <section className="appel-demo" aria-labelledby="appel-demo-titre">
      <div className="appel-demo__carte">
        <div className="appel-demo__texte">
          <h2 id="appel-demo-titre" className="appel-demo__titre">
            Voyez Fajkat avec les situations de votre structure.
          </h2>
          <p className="appel-demo__chapeau">
            Écrivez-nous sur WhatsApp : nous vous présentons l’outil à partir de vos propres cas, de
            l’accueil à la caisse.
          </p>
        </div>
        <div className="appel-demo__actions">
          <BoutonDemo offre={offre} taille="grande" />
          <Button href="#modules" variante="secondaire" taille="grande">
            Voir les modules
          </Button>
        </div>
      </div>
    </section>
  )
}
