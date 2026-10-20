import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Lock, NotebookPen } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import EcranAttente from '../../../../components/layout/EcranAttente/EcranAttente.jsx'
import Button from '../../../../components/ui/Button/Button.jsx'
import EmptyState from '../../../../components/ui/EmptyState/EmptyState.jsx'
import Icone from '../../../../components/ui/Icone/Icone.jsx'
import { useEnLigne } from '../../../../hooks/useEnLigne.js'
import { useOrganization } from '../../../../hooks/useOrganization.js'
import { useToast } from '../../../../hooks/useToast.js'
import FeatureRoute from '../../../../router/guards/FeatureRoute/FeatureRoute.jsx'
import RoleRoute from '../../../../router/guards/RoleRoute/RoleRoute.jsx'
import { entreeDepuisChemin, offresDeLEntree } from '../../../../router/navigation.js'
import { chargerPatient, cles as clesPatients } from '../../../patients/api.js'
import { nomComplet } from '../../../patients/utils.js'
import { ajouterAvenant, cles, reprendreConsultation } from '../../api.js'
import ConsultationTenue from '../../components/ConsultationTenue/ConsultationTenue.jsx'
import ReserveAuxSoignants from '../../components/ReserveAuxSoignants/ReserveAuxSoignants.jsx'
import CopieLocale from '../../components/CopieLocale/CopieLocale.jsx'
import EnTeteConsultation from '../../components/EnTeteConsultation/EnTeteConsultation.jsx'
import LectureConsultation from '../../components/LectureConsultation/LectureConsultation.jsx'
import ModaleAvenant from '../../components/ModaleAvenant/ModaleAvenant.jsx'
import SaisieConsultation from '../../components/SaisieConsultation/SaisieConsultation.jsx'
import {
  useConsultation,
  useExamensRapides,
  usePermissionsConsultation,
  useTypesConsultation,
} from '../../hooks/useConsultation.js'
import './Consultation.css'

const ENTREE = entreeDepuisChemin('/app/consultations')

export default function Consultation() {
  return (
    <FeatureRoute
      feature={ENTREE.feature}
      libelle={ENTREE.libelle}
      offres={offresDeLEntree(ENTREE)}
    >
      <RoleRoute roles={ENTREE.roles} libelle={ENTREE.libelle}>
        <ChargementConsultation />
      </RoleRoute>
    </FeatureRoute>
  )
}

function ChargementConsultation() {
  const { id } = useParams()
  const { structure } = useOrganization()
  const droits = usePermissionsConsultation(structure.id)
  const requete = useConsultation(droits.lire ? id : null)
  const c = requete.data
  const patient = useQuery({
    queryKey: clesPatients.patient(c?.patient_id),
    queryFn: () => chargerPatient(c.patient_id),
    enabled: Boolean(c?.patient_id),
  })

  useEffect(() => {
    document.title = `Consultation${patient.data ? ` — ${nomComplet(patient.data)}` : ''} — Fajkat`
  }, [patient.data])

  if (droits.chargement) return <EcranAttente integre libelle="Ouverture de la consultation…" />
  if (!droits.lire) return <ReserveAuxSoignants />
  if (requete.isPending) return <EcranAttente integre libelle="Ouverture de la consultation…" />
  if (requete.error) {
    if (requete.error.code === '42501') {
      return (
        <EmptyState
          niveau={1}
          icone={Lock}
          titre="Cette consultation n’est pas accessible avec votre compte"
          texte={requete.error.message}
          action={<Button to="/app/consultations">Mes consultations</Button>}
        />
      )
    }
    return (
      <EcranAttente
        integre
        libelle="La consultation n’a pas pu être ouverte"
        erreur={requete.error.message}
      >
        <Button onClick={() => requete.refetch()}>Réessayer</Button>
      </EcranAttente>
    )
  }
  return (
    <VueConsultation
      consultation={c}
      patient={patient.data}
      droits={droits}
      recharger={requete.refetch}
    />
  )
}

function VueConsultation({ consultation: c, patient, droits, recharger }) {
  const { structure } = useOrganization()
  const queryClient = useQueryClient()
  const enLigne = useEnLigne()
  const types = useTypesConsultation(structure.id)
  const examens = useExamensRapides(structure.id)

  if (c.status === 'validated') {
    return (
      <VueValidee consultation={c} patient={patient} ecrire={droits.ecrire} recharger={recharger} />
    )
  }
  if (!c.mine) {
    return (
      <div className="consultation">
        <EnTeteConsultation consultation={c} patient={patient} sensible={c.is_sensitive} />
        <CopieLocale id={c.id} />
        <ConsultationTenue
          consultation={c}
          peutReprendre={droits.ecrire}
          enLigne={enLigne}
          onReprendre={async () => {
            await reprendreConsultation(c.id)
            await recharger()
          }}
        />
      </div>
    )
  }
  if (types.isPending || examens.isPending) {
    return <EcranAttente integre libelle="Ouverture de la consultation…" />
  }
  return (
    <SaisieConsultation
      key={`${c.id}-${c.version}`}
      consultation={c}
      patient={patient}
      orgId={structure.id}
      types={types.data ?? []}
      examens={examens.data ?? []}
      onRecharger={recharger}
      onValidee={() => {
        queryClient.invalidateQueries({ queryKey: cles.mesBrouillons(structure.id) })
        recharger()
      }}
    />
  )
}

function VueValidee({ consultation: c, patient, ecrire, recharger }) {
  const toast = useToast()
  const enLigne = useEnLigne()
  const [avenant, setAvenant] = useState(false)
  return (
    <div className="consultation">
      <EnTeteConsultation consultation={c} patient={patient} sensible={c.is_sensitive} />
      <p className="consultation__aide">
        Cette consultation est validée : elle ne se modifie plus. Une correction s’ajoute en avenant
        daté.
      </p>
      {ecrire && (
        <div>
          <Button
            variante="secondaire"
            iconeDebut={<Icone icone={NotebookPen} />}
            disabled={!enLigne}
            onClick={() => setAvenant(true)}
          >
            Ajouter un avenant
          </Button>
        </div>
      )}
      <LectureConsultation consultation={c} />
      <ModaleAvenant
        ouvert={avenant}
        onFermer={() => setAvenant(false)}
        onEnvoyer={async (texte) => {
          await ajouterAvenant(c.id, texte)
          toast.succes('Avenant ajouté')
          await recharger()
        }}
      />
    </div>
  )
}
