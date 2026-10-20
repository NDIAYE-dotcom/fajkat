import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import Tabs from '../../../../components/ui/Tabs/Tabs.jsx'
import { useAuth } from '../../../../hooks/useAuth.js'
import { useFeature } from '../../../../hooks/useFeature.js'
import { useOrganization } from '../../../../hooks/useOrganization.js'
import { useToast } from '../../../../hooks/useToast.js'
import { cleStructures } from '../../../../lib/structures.js'
import RoleRoute from '../../../../router/guards/RoleRoute/RoleRoute.jsx'
import { ROLES_PARAMETRES } from '../../../../router/navigation.js'
import { cles } from '../../api.js'
import EtapeEquipe from '../../components/EtapeEquipe/EtapeEquipe.jsx'
import EtapeIdentite from '../../components/EtapeIdentite/EtapeIdentite.jsx'
import EtapeServices from '../../components/EtapeServices/EtapeServices.jsx'
import EtapeTiersPayants from '../../components/EtapeTiersPayants/EtapeTiersPayants.jsx'
import ReglagesOrdonnance from '../../../consultations/components/ReglagesOrdonnance/ReglagesOrdonnance.jsx'
import { useDemarrage } from '../../useDemarrage.js'
import './Parametres.css'

// Les écrans de l'assistant de démarrage, repris en modification. Enregistrer un écran
// le compte aussi comme fait dans la progression de la configuration. Les rubriques
// horsDemarrage (feature requise) enregistrent seulement leurs réglages.
const ONGLETS = [
  { id: 'identite', libelle: 'Identité', Composant: EtapeIdentite, cle: cles.fiche },
  { id: 'equipe', libelle: 'Équipe', Composant: EtapeEquipe, cle: cles.invitations },
  { id: 'services', libelle: 'Services et tarifs', Composant: EtapeServices, cle: cles.services },
  {
    id: 'tiers_payants',
    libelle: 'Tiers payants',
    Composant: EtapeTiersPayants,
    cle: cles.tiersPayants,
  },
  {
    id: 'ordonnance',
    libelle: 'Ordonnance',
    Composant: ReglagesOrdonnance,
    cle: cles.fiche,
    horsDemarrage: true,
    feature: 'consultations',
  },
]

export default function Parametres() {
  return (
    <RoleRoute roles={ROLES_PARAMETRES} libelle="Paramètres de la structure">
      <PageParametres />
    </RoleRoute>
  )
}

function PageParametres() {
  const { structure } = useOrganization()
  const { utilisateur } = useAuth()
  const { onboarding, marquer, enregistrerReglages } = useDemarrage()
  const consultations = useFeature('consultations').actif
  const onglets = ONGLETS.filter(
    (o) => !o.feature || (o.feature === 'consultations' && consultations),
  )
  const queryClient = useQueryClient()
  const toast = useToast()
  const [parametres, setParametres] = useSearchParams()
  // Version de chaque onglet : après un enregistrement, le formulaire repart des données
  // relues en base (et son brouillon est oublié).
  const [versions, setVersions] = useState({})

  const demande = parametres.get('onglet')
  const actif = onglets.some((o) => o.id === demande) ? demande : onglets[0].id

  useEffect(() => {
    document.title = `Paramètres — ${structure.name} — Fajkat`
  }, [structure.name])

  async function apresEnregistrement(onglet) {
    await Promise.all([
      queryClient.refetchQueries({ queryKey: onglet.cle(structure.id) }),
      // Logo et réglages repris par l'en-tête.
      queryClient.invalidateQueries({ queryKey: cleStructures(utilisateur?.id) }),
    ]).catch(() => {})
    setVersions((v) => ({ ...v, [onglet.id]: (v[onglet.id] ?? 0) + 1 }))
    toast.succes(`${onglet.libelle} : modifications enregistrées`)
  }

  return (
    <div className="parametres">
      <header className="parametres__entete">
        <p className="parametres__surtitre">{structure.name}</p>
        <h1 className="parametres__titre">Paramètres de la structure</h1>
      </header>

      <Tabs
        libelle="Rubriques des paramètres"
        actif={actif}
        onChange={(id) => setParametres({ onglet: id }, { replace: true })}
        onglets={onglets.map((onglet) => ({
          id: onglet.id,
          libelle: onglet.libelle,
          contenu: (
            <onglet.Composant
              key={versions[onglet.id] ?? 0}
              edition
              structure={structure}
              onboarding={onboarding}
              enregistrer={
                onglet.horsDemarrage
                  ? enregistrerReglages
                  : (options) => marquer(onglet.id, 'faite', options)
              }
              suivant={() => apresEnregistrement(onglet)}
            />
          ),
        }))}
      />
    </div>
  )
}
