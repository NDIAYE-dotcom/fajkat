import { Printer } from 'lucide-react'
import Button from '../../../../components/ui/Button/Button.jsx'
import Icone from '../../../../components/ui/Icone/Icone.jsx'
import Table from '../../../../components/ui/Table/Table.jsx'
import Tampon from '../../../../components/ui/Tampon/Tampon.jsx'
import { formatHeure } from '../../../../lib/format.js'
import { libelleAge, nomComplet } from '../../../patients/utils.js'
import { ETAPES } from '../../utils.js'
import './ArriveesDuJour.css'

// Registre des arrivées du jour, dans l'ordre de passage (priorité, puis heure d'arrivée).
// Le motif n'y figure pas : le tableau de la salle d'attente le montre aux seuls soignants.
export default function ArriveesDuJour({ lignes, chargement, vide, onReimprimer }) {
  const colonnes = [
    {
      cle: 'ticket_number',
      titre: 'Ticket',
      principale: true,
      rendu: (l) => <span className="arrivees__ticket">{l.ticket_number}</span>,
    },
    {
      cle: 'patient',
      titre: 'Patient',
      rendu: (l) => (
        <span className="arrivees__patient">
          <span>{nomComplet(l)}</span>
          <span className="arrivees__doux">
            <span className="arrivees__chiffres">{l.file_number}</span> · {l.sex} · {libelleAge(l)}
          </span>
        </span>
      ),
    },
    { cle: 'service_label', titre: 'Service' },
    {
      cle: 'priority',
      titre: 'Priorité',
      rendu: (l) =>
        l.priority === 'emergency' ? (
          <Tampon statut="urgent" />
        ) : (
          <span className={l.priority === 'normal' ? 'arrivees__doux' : undefined}>
            {l.priority_label}
          </span>
        ),
    },
    {
      cle: 'arrived_at',
      titre: 'Arrivée',
      rendu: (l) => <span className="arrivees__chiffres">{formatHeure(l.arrived_at)}</span>,
    },
    { cle: 'status', titre: 'Étape', rendu: (l) => ETAPES[l.status] ?? l.status },
    {
      cle: 'actions',
      titre: 'Ticket imprimé',
      rendu: (l) => (
        <Button
          variante="discret"
          iconeDebut={<Icone icone={Printer} />}
          onClick={() => onReimprimer(l)}
          aria-label={`Réimprimer le ticket ${l.ticket_number}`}
        >
          Réimprimer
        </Button>
      ),
    },
  ]

  return (
    <Table
      className="arrivees"
      colonnes={colonnes}
      lignes={lignes}
      cleLigne="visit_id"
      chargement={chargement}
      legende="Arrivées du jour"
      vide={vide}
      hauteurMax="none"
    />
  )
}
