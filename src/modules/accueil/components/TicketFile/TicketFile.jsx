import { formatDate, formatHeure } from '../../../../lib/format.js'
import { personnes } from '../../utils.js'
import './TicketFile.css'

// Ticket de file d'attente, rouleau thermique de 80 mm (classes .ticket-80 de print.css).
// Ni nom, ni motif, ni service : le ticket passe de main en main et traîne parfois sur un
// banc. Le QR mène au suivi du rang, valable le jour même.
// devant : personnes appelées avant ce patient au moment de l'impression (null : inconnu).
export default function TicketFile({ structureNom, visite, devant, qrSvg, className = '' }) {
  return (
    <div className={`ticket-80 ticket-file ${className}`.trim()}>
      <div className="ticket-80__entete">
        <p className="ticket-80__structure">{structureNom}</p>
        <p>Ticket de file d’attente</p>
      </div>
      <p className="ticket-80__numero">{visite.ticket_number}</p>
      <div className="ticket-80__ligne">
        <span>{formatDate(visite.arrived_at)}</span>
        <span>arrivée {formatHeure(visite.arrived_at)}</span>
      </div>
      {devant != null && (
        <p className="ticket-file__devant">
          {devant === 0 ? 'Vous êtes le prochain.' : `${personnes(devant)} avant vous.`}
        </p>
      )}
      <hr className="ticket-80__separateur" />
      <div className="ticket-file__suivi">
        <div
          className="ticket-file__qr"
          role="img"
          aria-label="QR code du suivi de votre tour"
          // SVG produit par la bibliothèque qrcode à partir de l'adresse du suivi.
          dangerouslySetInnerHTML={{ __html: qrSvg }}
        />
        <p>Scannez avec votre téléphone pour suivre votre tour.</p>
      </div>
      <hr className="ticket-80__separateur" />
      <p className="ticket-80__pied">
        Gardez ce ticket jusqu’à l’appel de votre numéro. Valable aujourd’hui seulement.
      </p>
    </div>
  )
}
