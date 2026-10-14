import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { grouperParFamille } from '../../../../router/navigation.js'
import Icone from '../../../ui/Icone/Icone.jsx'
import ListeModules from '../ListeModules/ListeModules.jsx'
import './MenuLateral.css'

// Menu latéral (écrans de 768 px et plus), repliable en icônes.
export default function MenuLateral({ visibles, replie, onBasculer }) {
  return (
    <nav
      className={`menu-lateral${replie ? ' menu-lateral--replie' : ''}`}
      aria-label="Menu principal"
    >
      <div className="menu-lateral__defilement">
        <ListeModules groupes={grouperParFamille(visibles)} replie={replie} />
      </div>
      <button
        type="button"
        className="menu-lateral__bascule"
        aria-expanded={!replie}
        onClick={onBasculer}
      >
        <Icone icone={replie ? PanelLeftOpen : PanelLeftClose} />
        <span className={replie ? 'sr-only' : undefined}>
          {replie ? 'Déplier le menu' : 'Replier le menu'}
        </span>
      </button>
    </nav>
  )
}
