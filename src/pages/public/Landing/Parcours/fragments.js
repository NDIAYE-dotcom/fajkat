// Correspondance entre les étapes du parcours (contenu.js) et leurs fragments d'interface.
import Agenda from './Fragments/Agenda/Agenda.jsx'
import Examens from './Fragments/Examens/Examens.jsx'
import Facture from './Fragments/Facture/Facture.jsx'
import FicheCpn from './Fragments/FicheCpn/FicheCpn.jsx'
import LitAttribue from './Fragments/LitAttribue/LitAttribue.jsx'
import RappelWhatsApp from './Fragments/RappelWhatsApp/RappelWhatsApp.jsx'
import Recu from './Fragments/Recu/Recu.jsx'
import ResultatLabo from './Fragments/ResultatLabo/ResultatLabo.jsx'
import Stock from './Fragments/Stock/Stock.jsx'
import Ticket from './Fragments/Ticket/Ticket.jsx'

export const FRAGMENTS = {
  ticket: Ticket,
  cpn: FicheCpn,
  stock: Stock,
  recu: Recu,
  whatsapp: RappelWhatsApp,
  agenda: Agenda,
  examen: Examens,
  lit: LitAttribue,
  labo: ResultatLabo,
  facture: Facture,
}
