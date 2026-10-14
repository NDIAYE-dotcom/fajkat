import { Wifi, WifiOff } from 'lucide-react'
import { useEnLigne } from '../../../../hooks/useEnLigne.js'
import Icone from '../../../ui/Icone/Icone.jsx'
import './IndicateurConnexion.css'

// État de la connexion. En ligne : pastille discrète (grand écran). Hors ligne : bandeau
// visible partout, qui rassure sur la saisie en cours.
// forme : 'pastille' (dans l'en-tête) ou 'bandeau' (sous l'en-tête, seulement hors ligne).
export default function IndicateurConnexion({ forme = 'pastille' }) {
  const enLigne = useEnLigne()

  if (forme === 'bandeau') {
    return (
      <div className="indicateur-connexion__zone" role="status">
        {!enLigne && (
          <p className="indicateur-connexion indicateur-connexion--bandeau">
            <Icone icone={WifiOff} className="indicateur-connexion__icone" />
            <span>
              <strong>Hors ligne.</strong> Votre saisie est gardée sur cet appareil ; l’envoi
              reprendra au retour de la connexion.
            </span>
          </p>
        )}
      </div>
    )
  }

  return (
    <p
      className={`indicateur-connexion indicateur-connexion--pastille${enLigne ? '' : ' indicateur-connexion--hors-ligne'}`}
    >
      <Icone icone={enLigne ? Wifi : WifiOff} className="indicateur-connexion__icone" />
      {enLigne ? 'En ligne' : 'Hors ligne'}
    </p>
  )
}
