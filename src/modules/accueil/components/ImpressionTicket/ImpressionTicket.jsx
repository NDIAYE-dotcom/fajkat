import RecuTicket from '../RecuTicket/RecuTicket.jsx'
import TicketFile from '../TicketFile/TicketFile.jsx'
import './ImpressionTicket.css'

// Ce qui sort de l'imprimante thermique : le ticket de file, puis, pour un ticket de
// consultation payé, le reçu sur la même bande, séparés par un repère de coupe.
export default function ImpressionTicket({ structureNom, visite, devant, qrSvg, recu }) {
  return (
    <>
      <TicketFile structureNom={structureNom} visite={visite} devant={devant} qrSvg={qrSvg} />
      {recu && (
        <>
          <p className="impression-ticket__coupe" aria-hidden="true">
            - - - - - coupez ici - - - - -
          </p>
          <RecuTicket structureNom={structureNom} recu={recu} />
        </>
      )}
    </>
  )
}
