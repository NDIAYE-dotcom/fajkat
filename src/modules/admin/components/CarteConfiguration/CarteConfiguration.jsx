import { ArrowRight } from 'lucide-react'
import Button from '../../../../components/ui/Button/Button.jsx'
import Icone from '../../../../components/ui/Icone/Icone.jsx'
import Panel from '../../../../components/ui/Panel/Panel.jsx'
import { useDemarrage } from '../../useDemarrage.js'
import { etapesRestantes, premiereEtapeAFaire } from '../../utils.js'
import './CarteConfiguration.css'

// Rappel sur le tableau de bord, tant que les cinq écrans de l'assistant ne sont pas faits.
// Réservé au propriétaire et à l'administrateur (le parent vérifie le rôle).
export default function CarteConfiguration() {
  const { onboarding, avancement } = useDemarrage()
  if (avancement.termine) return null

  const restantes = etapesRestantes(onboarding)
  const pourcentage = Math.round((avancement.faites / avancement.total) * 100)

  return (
    <Panel
      marque
      titre={
        <>
          Configuration :{' '}
          <span className="carte-configuration__chiffres">
            {avancement.faites} / {avancement.total}
          </span>{' '}
          terminé
        </>
      }
    >
      <div className="carte-configuration">
        <div
          className="carte-configuration__barre"
          role="progressbar"
          aria-label="Avancement de la configuration"
          aria-valuemin={0}
          aria-valuemax={avancement.total}
          aria-valuenow={avancement.faites}
          aria-valuetext={`${avancement.faites} écrans terminés sur ${avancement.total}`}
        >
          <span className="carte-configuration__rempli" style={{ width: `${pourcentage}%` }} />
        </div>
        <p className="carte-configuration__texte">
          Il reste : {restantes.map((e) => e.libelle).join(', ')}.
        </p>
        <Button
          to={`/app/demarrage?etape=${premiereEtapeAFaire(onboarding)}`}
          iconeFin={<Icone icone={ArrowRight} />}
          className="carte-configuration__bouton"
        >
          Reprendre la configuration
        </Button>
      </div>
    </Panel>
  )
}
