import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import EcranAttente from '../../../../components/layout/EcranAttente/EcranAttente.jsx'
import Tabs from '../../../../components/ui/Tabs/Tabs.jsx'
import { useOrganization } from '../../../../hooks/useOrganization.js'
import { useToast } from '../../../../hooks/useToast.js'
import FeatureRoute from '../../../../router/guards/FeatureRoute/FeatureRoute.jsx'
import RoleRoute from '../../../../router/guards/RoleRoute/RoleRoute.jsx'
import { entreeDepuisChemin, offresDeLEntree } from '../../../../router/navigation.js'
import { nomComplet } from '../../../patients/utils.js'
import { cles } from '../../api.js'
import FicheReference from '../../components/FicheReference/FicheReference.jsx'
import ImpressionReference from '../../components/ImpressionReference/ImpressionReference.jsx'
import ListeReferences, {
  ContreReference,
} from '../../components/ListeReferences/ListeReferences.jsx'
import ReserveAuxSoignants from '../../components/ReserveAuxSoignants/ReserveAuxSoignants.jsx'
import { usePermissionsConsultation } from '../../hooks/useConsultation.js'
import { useReferences } from '../../hooks/useDocuments.js'
import './References.css'

const ENTREE = entreeDepuisChemin('/app/references')

export default function References() {
  return (
    <FeatureRoute
      feature={ENTREE.feature}
      libelle={ENTREE.libelle}
      offres={offresDeLEntree(ENTREE)}
    >
      <RoleRoute roles={ENTREE.roles} libelle={ENTREE.libelle}>
        <PageReferences />
      </RoleRoute>
    </FeatureRoute>
  )
}

// Références : en attente de retour (signalées en retard après le délai de la structure),
// et contre-références reçues. Soignants qui rédigent seulement : rien n'est demandé à la
// base pour les autres.
function PageReferences() {
  const { structure } = useOrganization()
  const droits = usePermissionsConsultation(structure.id)
  const queryClient = useQueryClient()
  const toast = useToast()
  const [onglet, setOnglet] = useState('attente')
  const attente = useReferences(structure.id, 'pending', droits.references)
  const recues = useReferences(structure.id, 'returned', droits.references && onglet === 'recues')
  // Fenêtre : { type: 'fiche' | 'impression', r }
  const [fenetre, setFenetre] = useState(null)

  useEffect(() => {
    document.title = `Références — ${structure.name} — Fajkat`
  }, [structure.name])

  if (droits.chargement) return <EcranAttente integre libelle="Chargement des références…" />
  if (!droits.references) {
    return (
      <ReserveAuxSoignants
        titre="Les références sont réservées aux soignants"
        texte="Le contenu des lettres de référence et des contre-références est couvert par le secret médical."
      />
    )
  }

  const enAttente = attente.data ?? []
  const retards = enAttente.filter((r) => r.is_late).length
  const delai = enAttente[0]?.return_days
  const ouvrir = (r) => setFenetre({ type: 'fiche', r })
  const imprimer = (r) => setFenetre({ type: 'impression', r })

  return (
    <div className="references">
      <h1 className="references__titre">Références</h1>
      <p className="references__aide">
        Une référence sans <ContreReference />{' '}
        {delai ? `après ${delai} jours` : 'après le délai réglé'} est signalée en retard. Le délai
        se règle dans Paramètres → Références.
      </p>
      <Tabs
        libelle="Références"
        actif={onglet}
        onChange={setOnglet}
        onglets={[
          {
            id: 'attente',
            libelle: retards ? `En attente · ${retards} en retard` : 'En attente',
            compteur: attente.data ? enAttente.length : undefined,
            contenu: (
              <ListeReferences
                statut="pending"
                requete={attente}
                onOuvrir={ouvrir}
                onImprimer={imprimer}
              />
            ),
          },
          {
            id: 'recues',
            libelle: 'Retours reçus',
            contenu: (
              <ListeReferences
                statut="returned"
                requete={recues}
                onOuvrir={ouvrir}
                onImprimer={imprimer}
              />
            ),
          },
        ]}
      />
      {fenetre?.type === 'fiche' && (
        <FicheReference
          referenceId={fenetre.r.id}
          patientNom={nomComplet({
            last_name: fenetre.r.patient_last_name,
            first_name: fenetre.r.patient_first_name,
          })}
          onFermer={() => setFenetre(null)}
          onEnregistree={() => {
            toast.succes('Contre-référence enregistrée')
            queryClient.invalidateQueries({ queryKey: cles.toutesReferences(structure.id) })
            setFenetre(null)
          }}
        />
      )}
      {fenetre?.type === 'impression' && (
        <ImpressionReference referenceId={fenetre.r.id} onFermer={() => setFenetre(null)} />
      )}
    </div>
  )
}
