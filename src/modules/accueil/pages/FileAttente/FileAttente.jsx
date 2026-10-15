import { useQueryClient } from '@tanstack/react-query'
import { ListOrdered, UserCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import Button from '../../../../components/ui/Button/Button.jsx'
import EmptyState from '../../../../components/ui/EmptyState/EmptyState.jsx'
import Icone from '../../../../components/ui/Icone/Icone.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import { useOrganization } from '../../../../hooks/useOrganization.js'
import { useToast } from '../../../../hooks/useToast.js'
import FeatureRoute from '../../../../router/guards/FeatureRoute/FeatureRoute.jsx'
import RoleRoute from '../../../../router/guards/RoleRoute/RoleRoute.jsx'
import { entreeDepuisChemin, offresDeLEntree } from '../../../../router/navigation.js'
import { chargerPatient } from '../../../patients/api.js'
import ModaleNouveauPatient from '../../../patients/components/ModaleNouveauPatient/ModaleNouveauPatient.jsx'
import { usePermissionsPatients } from '../../../patients/hooks/usePermissionsPatients.js'
import { chargerJetonTicket, cles } from '../../api.js'
import ArriveesDuJour from '../../components/ArriveesDuJour/ArriveesDuJour.jsx'
import ModaleArrivee from '../../components/ModaleArrivee/ModaleArrivee.jsx'
import ModaleTicket from '../../components/ModaleTicket/ModaleTicket.jsx'
import { usePermissionsFile, useTableau } from '../../hooks/useFile.js'
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

// Accueil du jour : enregistrer une arrivée, imprimer le ticket, voir les arrivées.
// Fenêtres successives : arrivée -> (nouveau patient -> arrivée) -> ticket.
function AccueilDuJour() {
  const { structure } = useOrganization()
  const orgId = structure.id
  const toast = useToast()
  const queryClient = useQueryClient()
  const droits = usePermissionsFile(orgId)
  const droitsPatients = usePermissionsPatients(orgId)
  const tableau = useTableau(orgId)
  // fenetre : null | 'arrivee' | 'nouveau-patient' | { visite, service, nouveau }
  const [fenetre, setFenetre] = useState(null)
  const [patientCree, setPatientCree] = useState(null)
  const [preparation, setPreparation] = useState(null)

  useEffect(() => {
    document.title = `File d’attente — ${structure.name} — Fajkat`
  }, [structure.name])

  function ouvrirArrivee() {
    setPatientCree(null)
    setFenetre('arrivee')
  }

  // Patient créé, ou dossier proche ouvert depuis l'alerte de doublons : retour à l'arrivée.
  function retourArrivee(patient) {
    setPatientCree(patient)
    setFenetre('arrivee')
  }

  async function choisirDossierProche(id) {
    try {
      const patient = await chargerPatient(id)
      if (!patient) throw new Error('Ce dossier est introuvable.')
      retourArrivee(patient)
    } catch (e) {
      toast.erreur('Dossier non ouvert', { message: e.message })
    }
  }

  async function reimprimer(ligne) {
    setPreparation(ligne.visit_id)
    try {
      const jeton = await chargerJetonTicket(ligne.visit_id)
      setFenetre({
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

  const lignes = tableau.data ?? []
  const boutonArrivee = droits.ecrire && (
    <Button iconeDebut={<Icone icone={UserCheck} />} onClick={ouvrirArrivee}>
      Nouvelle arrivée
    </Button>
  )

  return (
    <div className="file-attente">
      <header className="file-attente__entete">
        <div>
          <p className="file-attente__surtitre">{structure.name}</p>
          <h1 className="file-attente__titre">File d’attente</h1>
        </div>
        {boutonArrivee}
      </header>

      {tableau.error && (
        <Message ton="erreur" action={<Button onClick={() => tableau.refetch()}>Réessayer</Button>}>
          <p>{tableau.error.message}</p>
        </Message>
      )}

      <ArriveesDuJour
        lignes={lignes}
        chargement={tableau.isPending}
        onReimprimer={(l) => preparation || reimprimer(l)}
        vide={
          <EmptyState
            icone={ListOrdered}
            titre="Aucune arrivée aujourd’hui"
            texte="Chaque patient enregistré reçoit un ticket numéroté par service : A-001, B-001…"
            action={boutonArrivee || undefined}
          />
        }
      />

      {fenetre === 'arrivee' && (
        <ModaleArrivee
          orgId={orgId}
          peutCreerPatient={droitsPatients.ecrire}
          patientCree={patientCree}
          onFermer={() => setFenetre(null)}
          onNouveauPatient={() => setFenetre('nouveau-patient')}
          onEnregistree={(visite, service) => {
            queryClient.invalidateQueries({ queryKey: cles.tableau(orgId) })
            setFenetre({ visite, service: service?.label, nouveau: true })
          }}
        />
      )}
      {fenetre === 'nouveau-patient' && (
        <ModaleNouveauPatient
          orgId={orgId}
          ouvert
          onFermer={() => setFenetre('arrivee')}
          onOuvrir={choisirDossierProche}
          onCree={(patient) => {
            toast.succes(`Dossier ${patient.file_number} créé`)
            retourArrivee(patient)
          }}
        />
      )}
      {fenetre && typeof fenetre === 'object' && (
        <ModaleTicket
          structureNom={structure.name}
          visite={fenetre.visite}
          service={fenetre.service}
          nouveau={fenetre.nouveau}
          onFermer={() => setFenetre(null)}
        />
      )}
    </div>
  )
}
