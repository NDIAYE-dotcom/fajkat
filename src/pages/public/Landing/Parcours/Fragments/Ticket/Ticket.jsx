import { formatDate } from '../../../../../../lib/format.js'
import './Ticket.css'

// Ticket de passage imprimé (80 mm) qui sort de l'imprimante quand l'étape devient active.
export default function Ticket({ actif }) {
  return (
    <div className="ticket" data-actif={actif || undefined}>
      <span className="ticket__fente" />
      <div className="ticket__papier">
        <p className="ticket__structure">Poste de santé</p>
        <p className="ticket__libelle">Ticket de passage</p>
        <p className="ticket__numero">A-012</p>
        <p className="ticket__motif">Consultation prénatale</p>
        <p className="ticket__priorite">Prioritaire · femme enceinte</p>
        <p className="ticket__ligne">
          <span>{formatDate(new Date())}</span>
          <span>07:52</span>
        </p>
        <p className="ticket__ligne">
          <span>Avant vous</span>
          <span>3 patients</span>
        </p>
      </div>
    </div>
  )
}
