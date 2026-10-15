import { formatDateHeure, formatFCFA } from '../../../../lib/format.js'
import { libellePaiement } from '../../utils.js'

// Reçu du ticket de consultation, imprimé à la suite du ticket de file sur le même rouleau
// (on coupe entre les deux). Le patient garde le reçu ; le ticket sert à l'appel.
// recu : { receipt_number, received_at, service_label, amount, payment_method,
// payment_reference }.
export default function RecuTicket({ structureNom, recu }) {
  return (
    <div className="ticket-80">
      <div className="ticket-80__entete">
        <p className="ticket-80__structure">{structureNom}</p>
        <p>Reçu de paiement</p>
      </div>
      <hr className="ticket-80__separateur" />
      <div className="ticket-80__ligne">
        <span>Reçu n°</span>
        <span>{recu.receipt_number}</span>
      </div>
      <div className="ticket-80__ligne">
        <span>Date</span>
        <span>{formatDateHeure(recu.received_at)}</span>
      </div>
      <hr className="ticket-80__separateur" />
      <div className="ticket-80__ligne">
        <span>{recu.service_label}</span>
        <span>{formatFCFA(recu.amount)}</span>
      </div>
      <hr className="ticket-80__separateur" />
      <div className="ticket-80__ligne ticket-80__total">
        <span>Total payé</span>
        <span>{formatFCFA(recu.amount)}</span>
      </div>
      <div className="ticket-80__ligne">
        <span>Paiement</span>
        <span>{libellePaiement(recu.payment_method)}</span>
      </div>
      {recu.payment_reference && (
        <div className="ticket-80__ligne">
          <span>Référence</span>
          <span>{recu.payment_reference}</span>
        </div>
      )}
      <p className="ticket-80__pied">Merci. Conservez ce reçu.</p>
    </div>
  )
}
