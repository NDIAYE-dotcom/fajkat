import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { useNavigation } from '../../../hooks/useNavigation.js'
import { useOrganization } from '../../../hooks/useOrganization.js'
import ToastProvider from '../../ui/Toast/ToastProvider.jsx'
import BandeauAbonnement from './BandeauAbonnement/BandeauAbonnement.jsx'
import BarreMobile from './BarreMobile/BarreMobile.jsx'
import EnTete from './EnTete/EnTete.jsx'
import IndicateurConnexion from './IndicateurConnexion/IndicateurConnexion.jsx'
import MenuLateral from './MenuLateral/MenuLateral.jsx'
import './AppLayout.css'

const CLE_MENU_REPLIE = 'fajkat.menu.replie'

function lireReplie() {
  try {
    return localStorage.getItem(CLE_MENU_REPLIE) === '1'
  } catch {
    return false
  }
}

function ecrireReplie(replie) {
  try {
    localStorage.setItem(CLE_MENU_REPLIE, replie ? '1' : '0')
  } catch {
    // Stockage indisponible : le menu restera déplié au prochain chargement.
  }
}

// Coquille de l'application connectée : en-tête, menu latéral (grand écran) ou barre
// inférieure (téléphone), bandeau d'abonnement, zone de contenu. Les notifications
// (ToastProvider) sont montées ici pour toutes les pages de /app.
// data-offre : ambiance des sections (claire en Poste de santé, sombre en Clinique).
export default function AppLayout() {
  const { structure } = useOrganization()
  const { visibles, estVisible } = useNavigation()
  const { pathname } = useLocation()
  const [replie, setReplie] = useState(lireReplie)

  // Nouvelle page : on repart du haut.
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [pathname])

  function basculer() {
    setReplie((r) => {
      ecrireReplie(!r)
      return !r
    })
  }

  return (
    <ToastProvider>
      <div className="app-layout" data-offre={structure.type}>
        <a href="#contenu" className="app-layout__evitement">
          Aller au contenu
        </a>
        <EnTete recherche={estVisible('patients')} />
        <IndicateurConnexion forme="bandeau" />
        <div className="app-layout__corps">
          <MenuLateral visibles={visibles} replie={replie} onBasculer={basculer} />
          <div className="app-layout__colonne">
            <BandeauAbonnement />
            <main id="contenu" tabIndex={-1} className="app-layout__contenu">
              <Outlet />
            </main>
          </div>
        </div>
        <BarreMobile visibles={visibles} />
      </div>
    </ToastProvider>
  )
}
