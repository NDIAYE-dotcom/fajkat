import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Merge } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '../../../../components/ui/Button/Button.jsx'
import Icone from '../../../../components/ui/Icone/Icone.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import Modal from '../../../../components/ui/Modal/Modal.jsx'
import Spinner from '../../../../components/ui/Spinner/Spinner.jsx'
import StepIndicator from '../../../../components/ui/StepIndicator/StepIndicator.jsx'
import { useToast } from '../../../../hooks/useToast.js'
import { chargerPatient, cles, fusionnerPatients } from '../../api.js'
import FusionComparaison from '../FusionComparaison/FusionComparaison.jsx'
import FusionRecherche from '../FusionRecherche/FusionRecherche.jsx'
import FusionResume from '../FusionResume/FusionResume.jsx'
import './ModaleFusion.css'

const ETAPES = ['Chercher l’autre dossier', 'Comparer et choisir', 'Confirmer']

// Fusion de deux dossiers (owner et admin), depuis la fiche : chercher l'autre dossier,
// comparer les deux côte à côte, choisir celui qu'on garde, confirmer avec un résumé.
// La base (merge_patients) journalise la fusion ; le dossier fusionné renvoie ensuite
// vers celui qu'on garde. Aucune fusion n'est jamais automatique.
export default function ModaleFusion({ patient, onFermer }) {
  const queryClient = useQueryClient()
  const naviguer = useNavigate()
  const toast = useToast()
  const [etape, setEtape] = useState(0)
  const [autreId, setAutreId] = useState(null)
  const [gardeId, setGardeId] = useState(null)
  const [motif, setMotif] = useState('')

  const autre = useQuery({
    queryKey: cles.patient(autreId),
    queryFn: () => chargerPatient(autreId),
    enabled: Boolean(autreId),
  })
  const dossierAutre = autre.data && autre.data.id !== patient.id ? autre.data : null
  const garde = gardeId === patient.id ? patient : dossierAutre
  const fusionne = gardeId === patient.id ? dossierAutre : patient

  const fusion = useMutation({
    mutationFn: () => fusionnerPatients(garde.id, fusionne.id, motif),
    onSuccess: (conserve) => {
      queryClient.invalidateQueries({ queryKey: ['patients'] })
      toast.succes(
        `Dossiers fusionnés : ${fusionne.file_number} renvoie vers ${conserve?.file_number ?? garde.file_number}`,
      )
      onFermer()
      naviguer(`/app/patients/${garde.id}`, { replace: garde.id !== patient.id })
    },
  })

  function choisirAutre(id) {
    setAutreId(id)
    setGardeId(null)
    setEtape(1)
  }

  function retour() {
    fusion.reset()
    setEtape((e) => e - 1)
  }

  let corps
  if (etape === 0) {
    corps = <FusionRecherche patient={patient} onChoisir={choisirAutre} />
  } else if (autre.isPending) {
    corps = <Spinner libelle="Ouverture de l’autre dossier" />
  } else if (autre.error || !dossierAutre) {
    corps = (
      <Message ton="erreur" titre="Ce dossier n’a pas pu être ouvert">
        <p>{autre.error?.message ?? 'Il a peut-être déjà été fusionné. Choisissez-en un autre.'}</p>
      </Message>
    )
  } else if (etape === 1) {
    corps = (
      <FusionComparaison a={patient} b={dossierAutre} gardeId={gardeId} onGarder={setGardeId} />
    )
  } else {
    corps = (
      <FusionResume
        garde={garde}
        fusionne={fusionne}
        motif={motif}
        onMotif={setMotif}
        erreur={fusion.error?.message}
      />
    )
  }

  const actions = [
    etape > 0 && (
      <Button
        key="retour"
        variante="secondaire"
        iconeDebut={<Icone icone={ArrowLeft} />}
        disabled={fusion.isPending}
        onClick={retour}
      >
        Retour
      </Button>
    ),
    etape === 1 && (
      <Button key="suite" disabled={!gardeId || !dossierAutre} onClick={() => setEtape(2)}>
        Voir le résumé
      </Button>
    ),
    etape === 2 && (
      <Button
        key="fusionner"
        iconeDebut={<Icone icone={Merge} />}
        chargement={fusion.isPending}
        disabled={!garde || !fusionne}
        onClick={() => fusion.mutate()}
      >
        Fusionner les deux dossiers
      </Button>
    ),
  ].filter(Boolean)

  return (
    <Modal
      ouvert
      onFermer={fusion.isPending ? () => {} : onFermer}
      fermerSurVoile={false}
      taille="large"
      titre="Fusionner avec un autre dossier"
      description="Pour une même personne enregistrée deux fois. Rien n’est fusionné avant votre confirmation."
      actions={actions.length ? actions : null}
    >
      <div className="modale-fusion">
        <StepIndicator etapes={ETAPES} courante={etape} libelle="Étapes de la fusion" />
        {corps}
      </div>
    </Modal>
  )
}
