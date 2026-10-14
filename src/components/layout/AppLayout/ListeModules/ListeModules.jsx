import { NavLink } from 'react-router-dom'
import { lienEntree } from '../../../../router/navigation.js'
import Icone from '../../../ui/Icone/Icone.jsx'
import './ListeModules.css'

// Entrées regroupées par famille, en onglets d'intercalaire.
// variante : 'menu' (menu latéral, sur l'ambiance de section) ou 'tiroir' (tiroir « Plus »).
// replie : menu réduit aux icônes ; les libellés restent lus par les lecteurs d'écran.
export default function ListeModules({ groupes, variante = 'menu', replie = false, onNaviguer }) {
  const classes = ['liste-modules', `liste-modules--${variante}`, replie && 'liste-modules--replie']
    .filter(Boolean)
    .join(' ')

  return (
    <div className={classes}>
      {groupes.map((groupe) => (
        <section
          key={groupe.id}
          className="liste-modules__famille"
          aria-labelledby={`famille-${variante}-${groupe.id}`}
        >
          <h2 id={`famille-${variante}-${groupe.id}`} className="liste-modules__titre">
            {groupe.titre}
          </h2>
          <ul className="liste-modules__liste">
            {groupe.entrees.map((entree) => (
              <li key={entree.code}>
                <NavLink
                  to={lienEntree(entree)}
                  end={!entree.chemin}
                  className="liste-modules__lien"
                  title={replie ? entree.libelle : undefined}
                  onClick={onNaviguer}
                >
                  <Icone icone={entree.icone} className="liste-modules__icone" />
                  <span className="liste-modules__libelle">{entree.libelle}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
