import { ArrowLeft, Lock } from 'lucide-react'
import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Button from '../../../../components/ui/Button/Button.jsx'
import EmptyState from '../../../../components/ui/EmptyState/EmptyState.jsx'
import Icone from '../../../../components/ui/Icone/Icone.jsx'
import StepIndicator from '../../../../components/ui/StepIndicator/StepIndicator.jsx'
import { useOrganization } from '../../../../hooks/useOrganization.js'
import EtapeEquipe from '../../components/EtapeEquipe/EtapeEquipe.jsx'
import EtapeIdentite from '../../components/EtapeIdentite/EtapeIdentite.jsx'
import EtapeRecapitulatif from '../../components/EtapeRecapitulatif/EtapeRecapitulatif.jsx'
import EtapeServices from '../../components/EtapeServices/EtapeServices.jsx'
import EtapeTiersPayants from '../../components/EtapeTiersPayants/EtapeTiersPayants.jsx'
import { useDemarrage } from '../../useDemarrage.js'
import { CODES_ETAPES, ETAPES_DEMARRAGE, peutConfigurer, premiereEtapeAFaire } from '../../utils.js'
import './Demarrage.css'

const COMPOSANTS = {
  identite: EtapeIdentite,
  equipe: EtapeEquipe,
  services: EtapeServices,
  tiers_payants: EtapeTiersPayants,
  recapitulatif: EtapeRecapitulatif,
}

// Assistant de démarrage (/app/demarrage?etape=…) : cinq écrans, reprise possible à tout moment.
// La progression est enregistrée dans organizations.settings.onboarding.
export default function Demarrage() {
  const { structure, role } = useOrganization()
  const { onboarding, marquer, enregistrerReglages } = useDemarrage()
  const [parametres, setParametres] = useSearchParams()
  const navigate = useNavigate()
  const autorise = peutConfigurer(role)

  const demande = parametres.get('etape')
  const code = CODES_ETAPES.includes(demande) ? demande : premiereEtapeAFaire(onboarding)
  const index = CODES_ETAPES.indexOf(code)

  useEffect(() => {
    document.title = `Configuration — ${structure.name} — Fajkat`
  }, [structure.name])

  // Assistant ouvert : il ne s'ouvrira plus de lui-même à la connexion. Hors ligne, il
  // se rouvrira la prochaine fois, sans autre conséquence.
  useEffect(() => {
    if (autorise && !onboarding.vu_le) {
      enregistrerReglages({ onboarding: { ...onboarding, vu_le: new Date().toISOString() } }).catch(
        () => {},
      )
    }
    // Une seule fois, à l'ouverture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function aller(cible) {
    setParametres({ etape: cible })
    window.scrollTo({ top: 0 })
  }

  const suivant = () => aller(CODES_ETAPES[Math.min(index + 1, CODES_ETAPES.length - 1)])

  // Un écran passé n'est pas terminé. Si l'enregistrement échoue (réseau), on avance quand
  // même : l'écran restera simplement « à faire ».
  function passer() {
    marquer(code, 'passee').catch(() => {})
    suivant()
  }

  const Etape = COMPOSANTS[code]

  return (
    <div className="demarrage">
      <header className="demarrage__entete">
        <span className="demarrage__marque">Fajkat</span>
        <Button to="/app" variante="discret" iconeDebut={<Icone icone={ArrowLeft} />}>
          Tableau de bord
        </Button>
      </header>

      <main className="demarrage__contenu" id="contenu">
        <div className="demarrage__titres">
          <p className="demarrage__surtitre">{structure.name}</p>
          <h1 className="demarrage__titre">Configurer votre structure</h1>
        </div>

        {autorise ? (
          <>
            <StepIndicator
              etapes={ETAPES_DEMARRAGE.map((e) => e.libelle)}
              courante={index}
              libelle="Étapes de la configuration"
            />
            <Etape
              key={code}
              structure={structure}
              onboarding={onboarding}
              enregistrer={(options) => marquer(code, 'faite', options)}
              passer={code === 'recapitulatif' ? undefined : passer}
              precedent={index > 0 ? () => aller(CODES_ETAPES[index - 1]) : undefined}
              suivant={suivant}
              aller={aller}
              quitter={() => navigate('/app')}
            />
          </>
        ) : (
          <EmptyState
            icone={Lock}
            niveau={2}
            titre="Configuration réservée"
            texte="Seuls le propriétaire et l’administrateur de la structure peuvent la configurer."
            action={<Button to="/app">Revenir au tableau de bord</Button>}
          />
        )}
      </main>
    </div>
  )
}
