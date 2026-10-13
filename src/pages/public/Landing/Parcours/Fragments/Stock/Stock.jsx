import { Package } from 'lucide-react'
import CarteFragment from '../../CarteFragment/CarteFragment.jsx'
import './Stock.css'

const CAPACITE = 40 // échelle de la jauge, en boîtes

// Une boîte sort du stock : le compteur passe de 24 à 23, la jauge recule.
export default function Stock({ actif }) {
  return (
    <CarteFragment icone={Package} titre="Dépôt · stock" precision="08:40" actif={actif}>
      <p className="stock__produit">Fer + acide folique</p>
      <p className="stock__conditionnement">Boîte de 30 comprimés · lot FA-2209</p>

      <div className="stock__compteur">
        <span className="stock__chiffres">
          <span className="stock__chiffre stock__chiffre--avant">24</span>
          <span className="stock__chiffre stock__chiffre--apres">23</span>
        </span>
        <span className="stock__unite">boîtes en stock</span>
      </div>

      <span className="stock__jauge">
        <span
          className="stock__remplissage"
          style={{ '--avant': 24 / CAPACITE, '--apres': 23 / CAPACITE }}
        />
      </span>
      <p className="stock__seuil">Seuil d’alerte : 10 boîtes · péremption 03/2027</p>

      <p className="stock__sortie">Sortie : 1 boîte · ordonnance d’Awa D.</p>
    </CarteFragment>
  )
}
