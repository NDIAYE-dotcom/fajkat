import { CreditCard, Ellipsis, Settings, UserRound } from 'lucide-react'
import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useOrganization } from '../../../../hooks/useOrganization.js'
import {
  entreesBarreMobile,
  grouperParFamille,
  lienEntree,
  ROLES_ABONNEMENT,
  ROLES_PARAMETRES,
} from '../../../../router/navigation.js'
import Drawer from '../../../ui/Drawer/Drawer.jsx'
import Icone from '../../../ui/Icone/Icone.jsx'
import ListeModules from '../ListeModules/ListeModules.jsx'
import './BarreMobile.css'

// Barre inférieure (moins de 768 px) : cinq entrées et « Plus », qui ouvre tout le reste.
export default function BarreMobile({ visibles }) {
  const { role } = useOrganization()
  const { pathname } = useLocation()
  const [ouvert, setOuvert] = useState(false)
  const barre = entreesBarreMobile(visibles)
  const fermer = () => setOuvert(false)

  // « Plus » est marqué actif quand la page ouverte n'a pas sa case dans la barre.
  const dansLaBarre = barre.some((e) =>
    e.chemin ? pathname.startsWith(lienEntree(e)) : pathname === '/app',
  )

  const compte = [
    { to: '/app/profil', libelle: 'Mon profil', icone: UserRound, visible: true },
    {
      to: '/app/parametres',
      libelle: 'Paramètres de la structure',
      icone: Settings,
      visible: ROLES_PARAMETRES.includes(role),
    },
    {
      to: '/app/abonnement',
      libelle: 'Abonnement',
      icone: CreditCard,
      visible: ROLES_ABONNEMENT.includes(role),
    },
  ].filter((lien) => lien.visible)

  return (
    <>
      <nav className="barre-mobile" aria-label="Navigation principale">
        <ul className="barre-mobile__liste">
          {barre.map((entree) => (
            <li key={entree.code} className="barre-mobile__case">
              <NavLink to={lienEntree(entree)} end={!entree.chemin} className="barre-mobile__lien">
                <Icone icone={entree.icone} />
                <span className="barre-mobile__libelle" aria-hidden={Boolean(entree.libelleCourt)}>
                  {entree.libelleCourt ?? entree.libelle}
                </span>
                {entree.libelleCourt && <span className="sr-only">{entree.libelle}</span>}
              </NavLink>
            </li>
          ))}
          <li className="barre-mobile__case">
            <button
              type="button"
              className={`barre-mobile__lien${dansLaBarre ? '' : ' barre-mobile__lien--actif'}`}
              aria-haspopup="dialog"
              onClick={() => setOuvert(true)}
            >
              <Icone icone={Ellipsis} />
              <span className="barre-mobile__libelle">Plus</span>
            </button>
          </li>
        </ul>
      </nav>

      <Drawer ouvert={ouvert} onFermer={fermer} titre="Tous les modules">
        <div className="barre-mobile__contenu">
          <ListeModules
            groupes={grouperParFamille(visibles)}
            variante="tiroir"
            onNaviguer={fermer}
          />
          <section aria-labelledby="barre-mobile-compte">
            <h2 id="barre-mobile-compte" className="barre-mobile__titre">
              Compte et structure
            </h2>
            <ul className="barre-mobile__compte">
              {compte.map((lien) => (
                <li key={lien.to}>
                  <NavLink to={lien.to} className="barre-mobile__lien-compte" onClick={fermer}>
                    <Icone icone={lien.icone} className="barre-mobile__icone" />
                    {lien.libelle}
                  </NavLink>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </Drawer>
    </>
  )
}
