import { useQuery } from '@tanstack/react-query'
import { Printer } from 'lucide-react'
import { useRef } from 'react'
import { createPortal } from 'react-dom'
import Button from '../../../../components/ui/Button/Button.jsx'
import Icone from '../../../../components/ui/Icone/Icone.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import Modal from '../../../../components/ui/Modal/Modal.jsx'
import Skeleton from '../../../../components/ui/Skeleton/Skeleton.jsx'
import { imprimer } from '../../../../lib/impression.js'
import { dessinerQr } from '../../../../lib/qr.js'
import { chargerSuiviTicket } from '../../api.js'
import { adresseSuivi } from '../../utils.js'
import ImpressionTicket from '../ImpressionTicket/ImpressionTicket.jsx'
import './ModaleTicket.css'

// Aperçu du ticket et impression sur rouleau de 80 mm. La copie imprimée est rendue hors
// de la fenêtre (portail) : un <dialog> ne s'imprime pas proprement.
// visite : { ticket_number, arrived_at, public_code } ; service : libellé, pour l'accueil
// seulement (il n'est pas imprimé). recu : ticket de consultation payé, imprimé à la suite
// (voir RecuTicket) ; gratuite : motif d'un ticket gratuit, rappelé à l'écran seulement.
export default function ModaleTicket({
  structureNom,
  visite,
  service,
  recu,
  gratuite,
  nouveau,
  onFermer,
}) {
  const aImprimer = useRef(null)
  const adresse = adresseSuivi(visite.public_code)
  const qr = useQuery({
    queryKey: ['accueil', 'qr', adresse],
    queryFn: () => dessinerQr(adresse),
    staleTime: Infinity,
  })
  // Rang au moment de l'impression ; s'il n'arrive pas, le ticket s'imprime sans lui.
  const suivi = useQuery({
    queryKey: ['accueil', 'rang', visite.public_code],
    queryFn: () => chargerSuiviTicket(visite.public_code),
    staleTime: 0,
  })
  const devant = suivi.data?.status === 'waiting' ? (suivi.data.ahead ?? 0) : null
  const pret = Boolean(qr.data) && !suivi.isPending

  const ticket = (
    <ImpressionTicket
      structureNom={structureNom}
      visite={visite}
      devant={devant}
      qrSvg={qr.data}
      recu={recu}
    />
  )

  return (
    <Modal
      ouvert
      onFermer={onFermer}
      titre={
        nouveau ? `Arrivée enregistrée : ${visite.ticket_number}` : `Ticket ${visite.ticket_number}`
      }
      description={
        service ? `Service : ${service}. Le service n’est pas imprimé sur le ticket.` : undefined
      }
      actions={
        <>
          <Button variante="secondaire" onClick={onFermer}>
            Fermer
          </Button>
          <Button
            iconeDebut={<Icone icone={Printer} />}
            disabled={!pret}
            onClick={() => imprimer(aImprimer.current, 'ticket')}
          >
            Imprimer le ticket
          </Button>
        </>
      }
    >
      <div className="modale-ticket">
        {gratuite && (
          <Message ton="info">
            <p>Ticket gratuit : {gratuite}. Aucun reçu n’est imprimé.</p>
          </Message>
        )}
        {qr.error && (
          <Message ton="erreur" action={<Button onClick={() => qr.refetch()}>Réessayer</Button>}>
            <p>Le QR code n’a pas pu être dessiné. {qr.error.message}</p>
          </Message>
        )}
        {pret ? ticket : !qr.error && <Skeleton forme="bloc" largeur="72mm" hauteur="11rem" />}
      </div>
      {pret &&
        createPortal(
          <div ref={aImprimer} className="impression-seule modale-ticket__impression">
            {ticket}
          </div>,
          document.body,
        )}
    </Modal>
  )
}
