import { ListChecks, Ticket } from 'lucide-react'
import { useEffect, useState } from 'react'
import Button from '../../../../components/ui/Button/Button.jsx'
import EmptyState from '../../../../components/ui/EmptyState/EmptyState.jsx'
import Icone from '../../../../components/ui/Icone/Icone.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import { useOrganization } from '../../../../hooks/useOrganization.js'
import FeatureRoute from '../../../../router/guards/FeatureRoute/FeatureRoute.jsx'
import RoleRoute from '../../../../router/guards/RoleRoute/RoleRoute.jsx'
import { entreeDepuisChemin, offresDeLEntree } from '../../../../router/navigation.js'
import { usePermissionsPatients } from '../../../patients/hooks/usePermissionsPatients.js'
import BilanTickets from '../../components/BilanTickets/BilanTickets.jsx'
import FenetresAccueil from '../../components/FenetresAccueil/FenetresAccueil.jsx'
import ListeTickets from '../../components/ListeTickets/ListeTickets.jsx'
import ModaleMotifs from '../../components/ModaleMotifs/ModaleMotifs.jsx'
import { useBilanTickets, usePermissionsFile, useTicketsDuJour } from '../../hooks/useFile.js'
import '../FileAttente/FileAttente.css'

const ENTREE = entreeDepuisChemin('/app/tickets')

export default function TicketsConsultation() {
  return (
    <FeatureRoute
      feature={ENTREE.feature}
      libelle={ENTREE.libelle}
      offres={offresDeLEntree(ENTREE)}
    >
      <RoleRoute roles={ENTREE.roles} libelle={ENTREE.libelle}>
        <Tickets />
      </RoleRoute>
    </FeatureRoute>
  )
}

// Tickets de consultation d'un poste de santé : vente (qui enregistre aussi l'arrivée),
// bilan du jour (gratuits comptés à part), réimpression, motifs de gratuité.
function Tickets() {
  const { structure, role } = useOrganization()
  const orgId = structure.id
  const droits = usePermissionsFile(orgId)
  const droitsPatients = usePermissionsPatients(orgId)
  const tickets = useTicketsDuJour(orgId)
  const bilan = useBilanTickets(orgId)
  const [fenetre, setFenetre] = useState(null)
  const [motifs, setMotifs] = useState(false)
  const gereLesMotifs = ['owner', 'admin'].includes(role)

  useEffect(() => {
    document.title = `Tickets de consultation — ${structure.name} — Fajkat`
  }, [structure.name])

  function reimprimer(ligne) {
    setFenetre({
      type: 'ticket',
      visite: ligne,
      service: null,
      recu: ligne.receipt_number ? { ...ligne, received_at: ligne.sold_at } : null,
      gratuite: Number(ligne.amount) === 0 ? ligne.exemption_reason : null,
      nouveau: false,
    })
  }

  const erreur = tickets.error ?? bilan.error

  return (
    <div className="file-attente">
      <header className="file-attente__entete">
        <div>
          <p className="file-attente__surtitre">{structure.name}</p>
          <h1 className="file-attente__titre">Tickets de consultation</h1>
        </div>
        <div className="file-attente__actions">
          {droits.vendreTicket && (
            <Button
              iconeDebut={<Icone icone={Ticket} />}
              onClick={() => setFenetre({ type: 'vente' })}
            >
              Vendre un ticket
            </Button>
          )}
          {gereLesMotifs && (
            <Button
              variante="secondaire"
              iconeDebut={<Icone icone={ListChecks} />}
              onClick={() => setMotifs(true)}
            >
              Motifs de gratuité
            </Button>
          )}
        </div>
      </header>

      {erreur && (
        <Message
          ton="erreur"
          action={
            <Button
              onClick={() => {
                tickets.refetch()
                bilan.refetch()
              }}
            >
              Réessayer
            </Button>
          }
        >
          <p>{erreur.message}</p>
        </Message>
      )}

      <BilanTickets bilan={bilan.data} chargement={bilan.isPending} />

      <ListeTickets
        lignes={tickets.data ?? []}
        chargement={tickets.isPending}
        onReimprimer={reimprimer}
        vide={
          <EmptyState
            icone={Ticket}
            titre="Aucun ticket vendu aujourd’hui"
            texte="Le ticket encaisse la consultation et donne au patient son numéro dans la file."
          />
        }
      />

      <FenetresAccueil
        orgId={orgId}
        structureNom={structure.name}
        peutCreerPatient={droitsPatients.ecrire}
        fenetre={fenetre}
        setFenetre={setFenetre}
      />
      {motifs && <ModaleMotifs orgId={orgId} onFermer={() => setMotifs(false)} />}
    </div>
  )
}
