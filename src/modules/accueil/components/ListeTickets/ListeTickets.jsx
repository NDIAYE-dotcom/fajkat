import { Printer } from 'lucide-react'
import Button from '../../../../components/ui/Button/Button.jsx'
import Icone from '../../../../components/ui/Icone/Icone.jsx'
import Table from '../../../../components/ui/Table/Table.jsx'
import Tampon from '../../../../components/ui/Tampon/Tampon.jsx'
import { formatFCFA, formatHeure } from '../../../../lib/format.js'
import { nomComplet } from '../../../patients/utils.js'
import { libellePaiement } from '../../utils.js'
import '../ArriveesDuJour/ArriveesDuJour.css'

// Tickets de consultation vendus aujourd'hui, du plus récent au plus ancien.
export default function ListeTickets({ lignes, chargement, vide, onReimprimer }) {
  const colonnes = [
    {
      cle: 'ticket_number',
      titre: 'Ticket',
      principale: true,
      rendu: (l) => <span className="arrivees__ticket">{l.ticket_number}</span>,
    },
    {
      cle: 'sold_at',
      titre: 'Heure',
      rendu: (l) => <span className="arrivees__chiffres">{formatHeure(l.sold_at)}</span>,
    },
    {
      cle: 'patient',
      titre: 'Patient',
      rendu: (l) => (
        <span className="arrivees__patient">
          <span>{nomComplet(l)}</span>
          <span className="arrivees__doux arrivees__chiffres">{l.file_number}</span>
        </span>
      ),
    },
    { cle: 'service_label', titre: 'Prestation', masquerMobile: true },
    {
      cle: 'amount',
      titre: 'Montant',
      rendu: (l) =>
        Number(l.amount) === 0 ? (
          <span className="arrivees__patient">
            <span>Gratuit · {l.exemption_reason}</span>
            <span className="arrivees__doux">
              valeur <span className="arrivees__chiffres">{formatFCFA(l.unit_price)}</span>
            </span>
          </span>
        ) : (
          <span className="arrivees__patient">
            <span className="arrivees__chiffres">{formatFCFA(l.amount)}</span>
            <span className="arrivees__doux">{libellePaiement(l.payment_method)}</span>
          </span>
        ),
    },
    {
      cle: 'receipt_number',
      titre: 'Reçu',
      rendu: (l) =>
        l.receipt_number ? (
          <span className="arrivees__patient">
            <span className="arrivees__chiffres">{l.receipt_number}</span>
            <Tampon statut="paye" />
          </span>
        ) : (
          '—'
        ),
    },
    {
      cle: 'actions',
      titre: 'Impression',
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
      colonnes={colonnes}
      lignes={lignes}
      cleLigne="consultation_ticket_id"
      chargement={chargement}
      legende="Tickets vendus aujourd’hui"
      vide={vide}
      hauteurMax="none"
    />
  )
}
