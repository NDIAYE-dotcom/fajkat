import { CloudOff, Check, LoaderCircle, TriangleAlert } from 'lucide-react'
import Button from '../../../../components/ui/Button/Button.jsx'
import Icone from '../../../../components/ui/Icone/Icone.jsx'
import { formatHeure } from '../../../../lib/format.js'
import './IndicateurEnregistrement.css'

// « Enregistré à 10:42 » : où en est la saisie. Annoncé poliment aux lecteurs d'écran.
//   etat : voir useSauvegardeConsultation.
export default function IndicateurEnregistrement({ etat, serveurA, localA, enLigne, onReessayer }) {
  let icone = Check
  let texte = serveurA
    ? `Enregistré à ${formatHeure(serveurA)}`
    : 'Rien à enregistrer pour l’instant'
  let ton = 'ok'
  if (etat === 'hors_ligne' || (!enLigne && etat !== 'a_jour')) {
    icone = CloudOff
    ton = 'attente'
    texte = `Hors ligne : saisie gardée sur cet appareil${localA ? ` (${formatHeure(localA)})` : ''}, envoyée au retour de la connexion`
  } else if (etat === 'envoi') {
    icone = LoaderCircle
    texte = 'Enregistrement…'
  } else if (etat === 'modifie') {
    texte = localA
      ? `Gardé sur cet appareil à ${formatHeure(localA)} · envoi automatique`
      : 'Modifications en cours · envoi automatique'
  } else if (etat === 'erreur') {
    icone = TriangleAlert
    ton = 'erreur'
    texte =
      'Enregistrement sur le serveur impossible pour l’instant : saisie gardée sur cet appareil'
  }
  return (
    <p className={`indicateur-enregistrement indicateur-enregistrement--${ton}`} role="status">
      <Icone icone={icone} className="indicateur-enregistrement__icone" />
      <span>{texte}</span>
      {etat === 'erreur' && (
        <Button variante="discret" onClick={onReessayer}>
          Réessayer
        </Button>
      )}
    </p>
  )
}
