import { BellRing, Printer, Repeat } from 'lucide-react'
import Button from '../../../../components/ui/Button/Button.jsx'
import Icone from '../../../../components/ui/Icone/Icone.jsx'
import { ajouterJours } from '../../agenda.js'
import { useRappels } from '../../hooks/useAgenda.js'
import './RaccourcisAgenda.css'

// Raccourcis sous le titre de l'agenda : rappels de demain (nombre de rendez-vous pas
// encore rappelés), planning du jour affiché à imprimer, série de rendez-vous.
export default function RaccourcisAgenda({ orgId, aujourdhui, droits, onImprimer, onSerie }) {
  const rappels = useRappels(orgId, ajouterJours(aujourdhui, 1), Boolean(droits.read))
  const restants = rappels.data?.filter((r) => !r.reminder_done_at).length

  return (
    <div className="raccourcis-agenda">
      {droits.read && (
        <Button
          variante="secondaire"
          to="/app/rendez-vous/rappels"
          iconeDebut={<Icone icone={BellRing} />}
        >
          {restants === undefined ? 'À rappeler demain' : `À rappeler demain (${restants})`}
        </Button>
      )}
      <Button variante="secondaire" iconeDebut={<Icone icone={Printer} />} onClick={onImprimer}>
        Imprimer le planning
      </Button>
      {droits.write && (
        <Button variante="secondaire" iconeDebut={<Icone icone={Repeat} />} onClick={onSerie}>
          Série de rendez-vous
        </Button>
      )}
    </div>
  )
}
