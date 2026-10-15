import { ListOrdered, Ticket, UserCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import Button from '../../../../components/ui/Button/Button.jsx'
import EmptyState from '../../../../components/ui/EmptyState/EmptyState.jsx'
import Icone from '../../../../components/ui/Icone/Icone.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import Tabs from '../../../../components/ui/Tabs/Tabs.jsx'
import { useOrganization } from '../../../../hooks/useOrganization.js'
import { useToast } from '../../../../hooks/useToast.js'
import FeatureRoute from '../../../../router/guards/FeatureRoute/FeatureRoute.jsx'
import RoleRoute from '../../../../router/guards/RoleRoute/RoleRoute.jsx'
import { entreeDepuisChemin, offresDeLEntree } from '../../../../router/navigation.js'
import { usePermissionsPatients } from '../../../patients/hooks/usePermissionsPatients.js'
import { chargerJetonTicket } from '../../api.js'
import ArriveesDuJour from '../../components/ArriveesDuJour/ArriveesDuJour.jsx'
import FenetresAccueil from '../../components/FenetresAccueil/FenetresAccueil.jsx'
import TableauFile from '../../components/TableauFile/TableauFile.jsx'
import { usePermissionsFile, useTableau } from '../../hooks/useFile.js'
import { useFileTempsReel } from '../../hooks/useTableauFile.js'
import './FileAttente.css'

const ENTREE = entreeDepuisChemin('/app/file-attente')

export default function FileAttente() {
  return (
    <FeatureRoute
      feature={ENTREE.feature}
      libelle={ENTREE.libelle}
      offres={offresDeLEntree(ENTREE)}
    >
      <RoleRoute roles={ENTREE.roles} libelle={ENTREE.libelle}>
        <AccueilDuJour />
      </RoleRoute>
    </FeatureRoute>
  )
}

// Accueil du jour : enregistrer une arrivée (ou vendre un ticket de consultation dans un
// poste de santé), imprimer le ticket ; tableau de la salle d'attente (mis à jour en temps
// réel depuis tous les appareils) et registre des arrivées du jour.
function AccueilDuJour() {
  const { structure } = useOrganization()
  const orgId = structure.id
  const toast = useToast()
  const droits = usePermissionsFile(orgId)
  const droitsPatients = usePermissionsPatients(orgId)
  const tableau = useTableau(orgId)
  useFileTempsReel(orgId)
  const [fenetre, setFenetre] = useState(null)
  const [preparation, setPreparation] = useState(null)

  useEffect(() => {
    document.title = `File d’attente — ${structure.name} — Fajkat`
  }, [structure.name])

  async function reimprimer(ligne) {
    setPreparation(ligne.visit_id)
    try {
      const jeton = await chargerJetonTicket(ligne.visit_id)
      setFenetre({
        type: 'ticket',
        visite: {
          ticket_number: ligne.ticket_number,
          arrived_at: ligne.arrived_at,
          public_code: jeton,
        },
        service: ligne.service_label,
        nouveau: false,
      })
    } catch (e) {
      toast.erreur('Ticket non préparé', { message: e.message })
    } finally {
      setPreparation(null)
    }
  }

  const boutons = (
    <>
      {droits.vendreTicket && (
        <Button iconeDebut={<Icone icone={Ticket} />} onClick={() => setFenetre({ type: 'vente' })}>
          Vendre un ticket
        </Button>
      )}
      {droits.ecrire && (
        <Button
          variante={droits.vendreTicket ? 'secondaire' : 'primaire'}
          iconeDebut={<Icone icone={UserCheck} />}
          onClick={() => setFenetre({ type: 'arrivee' })}
        >
          {/* Poste de santé : CPN, vaccination… sans ticket de consultation. */}
          {droits.vendreTicket ? 'Arrivée sans ticket' : 'Nouvelle arrivée'}
        </Button>
      )}
    </>
  )
  const peutAgir = droits.ecrire || droits.vendreTicket

  return (
    <div className="file-attente">
      <header className="file-attente__entete">
        <div>
          <p className="file-attente__surtitre">{structure.name}</p>
          <h1 className="file-attente__titre">File d’attente</h1>
        </div>
        {peutAgir && <div className="file-attente__actions">{boutons}</div>}
      </header>

      {tableau.error && (
        <Message ton="erreur" action={<Button onClick={() => tableau.refetch()}>Réessayer</Button>}>
          <p>{tableau.error.message}</p>
        </Message>
      )}

      <Tabs
        libelle="Affichage de la file"
        onglets={[
          {
            id: 'tableau',
            libelle: 'Tableau',
            contenu: (
              <TableauFile
                orgId={orgId}
                lignes={tableau.data ?? []}
                chargement={tableau.isPending}
                ecrire={droits.ecrire}
              />
            ),
          },
          {
            id: 'arrivees',
            libelle: 'Arrivées du jour',
            compteur: tableau.data?.length,
            contenu: (
              <ArriveesDuJour
                lignes={tableau.data ?? []}
                chargement={tableau.isPending}
                onReimprimer={(l) => preparation || reimprimer(l)}
                vide={
                  <EmptyState
                    icone={ListOrdered}
                    titre="Aucune arrivée aujourd’hui"
                    texte="Chaque patient enregistré reçoit un ticket numéroté par service : A-001, B-001…"
                  />
                }
              />
            ),
          },
        ]}
      />

      <FenetresAccueil
        orgId={orgId}
        structureNom={structure.name}
        peutCreerPatient={droitsPatients.ecrire}
        fenetre={fenetre}
        setFenetre={setFenetre}
      />
    </div>
  )
}
