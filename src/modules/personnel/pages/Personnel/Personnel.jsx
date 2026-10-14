import { useQuery, useQueryClient } from '@tanstack/react-query'
import { UserPlus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import EcranAttente from '../../../../components/layout/EcranAttente/EcranAttente.jsx'
import Button from '../../../../components/ui/Button/Button.jsx'
import Icone from '../../../../components/ui/Icone/Icone.jsx'
import Tabs from '../../../../components/ui/Tabs/Tabs.jsx'
import { useAuth } from '../../../../hooks/useAuth.js'
import { useFeatures } from '../../../../hooks/useFeature.js'
import { useOrganization } from '../../../../hooks/useOrganization.js'
import { useToast } from '../../../../hooks/useToast.js'
import FeatureRoute from '../../../../router/guards/FeatureRoute/FeatureRoute.jsx'
import RoleRoute from '../../../../router/guards/RoleRoute/RoleRoute.jsx'
import { entreeDepuisChemin, offresDeLEntree } from '../../../../router/navigation.js'
import {
  chargerAEnvoyer,
  chargerInvitations,
  chargerMembres,
  chargerPlaces,
  cles,
} from '../../api.js'
import CompteurPlaces from '../../components/CompteurPlaces/CompteurPlaces.jsx'
import FicheMembre from '../../components/FicheMembre/FicheMembre.jsx'
import ListeConges from '../../components/ListeConges/ListeConges.jsx'
import ListeMembres from '../../components/ListeMembres/ListeMembres.jsx'
import MatricePermissions from '../../components/MatricePermissions/MatricePermissions.jsx'
import ModaleInviter from '../../components/ModaleInviter/ModaleInviter.jsx'
import ModaleMembre from '../../components/ModaleMembre/ModaleMembre.jsx'
import OngletInvitations from '../../components/OngletInvitations/OngletInvitations.jsx'
import PlanningSemaine from '../../components/PlanningSemaine/PlanningSemaine.jsx'
import PresencesDuJour from '../../components/PresencesDuJour/PresencesDuJour.jsx'
import { statutInvitation } from '../../utils.js'
import './Personnel.css'

const ENTREE = entreeDepuisChemin('/app/personnel')
const ONGLETS = ['membres', 'planning', 'presences', 'conges', 'invitations', 'permissions']

export default function Personnel() {
  return (
    <FeatureRoute
      feature={ENTREE.feature}
      libelle={ENTREE.libelle}
      offres={offresDeLEntree(ENTREE)}
    >
      <RoleRoute roles={ENTREE.roles} libelle={ENTREE.libelle}>
        <PagePersonnel />
      </RoleRoute>
    </FeatureRoute>
  )
}

function PagePersonnel() {
  const { structure, role } = useOrganization()
  const { utilisateur } = useAuth()
  const { features } = useFeatures()
  const queryClient = useQueryClient()
  const toast = useToast()
  const [parametres, setParametres] = useSearchParams()
  const [membreOuvert, setMembreOuvert] = useState(null)
  const [ficheOuverte, setFicheOuverte] = useState(null)
  // null : fermée ; {} : nouvelle invitation ; { envoi } : écran du lien.
  const [inviter, setInviter] = useState(null)
  const orgId = structure.id

  const membres = useQuery({ queryKey: cles.membres(orgId), queryFn: () => chargerMembres(orgId) })
  const invitations = useQuery({
    queryKey: cles.invitations(orgId),
    queryFn: () => chargerInvitations(orgId),
  })
  const aEnvoyer = useQuery({
    queryKey: cles.aEnvoyer(orgId),
    queryFn: () => chargerAEnvoyer(orgId),
  })
  const places = useQuery({ queryKey: cles.places(orgId), queryFn: () => chargerPlaces(orgId) })

  useEffect(() => {
    document.title = `Personnel — ${structure.name} — Fajkat`
  }, [structure.name])

  function rafraichir() {
    for (const cle of [cles.membres, cles.invitations, cles.aEnvoyer, cles.places]) {
      queryClient.invalidateQueries({ queryKey: cle(orgId) })
    }
  }

  const demande = parametres.get('onglet')
  const actif = ONGLETS.includes(demande) ? demande : 'membres'

  const premiereErreur = membres.error ?? invitations.error ?? aEnvoyer.error
  if (premiereErreur && !membres.data) {
    return (
      <EcranAttente
        integre
        libelle="Le personnel n’a pas pu être chargé"
        erreur={premiereErreur.message}
      >
        <Button onClick={rafraichir}>Réessayer</Button>
      </EcranAttente>
    )
  }

  const enAttente = (invitations.data ?? []).filter((i) => statutInvitation(i) === 'en_attente')
  const nbAEnvoyer = aEnvoyer.data?.length ?? 0

  return (
    <div className="personnel">
      <header className="personnel__entete">
        <div>
          <p className="personnel__surtitre">{structure.name}</p>
          <h1 className="personnel__titre">Personnel</h1>
          <CompteurPlaces places={places.data} />
        </div>
        <Button iconeDebut={<Icone icone={UserPlus} />} onClick={() => setInviter({})}>
          Inviter un membre
        </Button>
      </header>

      <Tabs
        libelle="Rubriques du personnel"
        actif={actif}
        onChange={(id) => setParametres({ onglet: id }, { replace: true })}
        onglets={[
          {
            id: 'membres',
            libelle: 'Membres',
            compteur: membres.data?.filter((m) => m.is_active).length,
            contenu: (
              <ListeMembres
                membres={membres.data}
                chargement={membres.isPending}
                moi={utilisateur?.id}
                onGerer={setMembreOuvert}
                onFiche={setFicheOuverte}
              />
            ),
          },
          {
            id: 'planning',
            libelle: 'Planning',
            contenu: <PlanningSemaine structure={structure} modifiable moi={utilisateur?.id} />,
          },
          {
            id: 'presences',
            libelle: 'Présences',
            contenu: <PresencesDuJour orgId={orgId} />,
          },
          {
            id: 'conges',
            libelle: 'Congés',
            contenu: <ListeConges orgId={orgId} />,
          },
          {
            id: 'invitations',
            libelle: 'Invitations',
            compteur: enAttente.length + nbAEnvoyer || undefined,
            contenu: (
              <OngletInvitations
                structure={structure}
                aEnvoyer={aEnvoyer.data}
                invitations={invitations.data}
                chargement={invitations.isPending}
                onLien={(envoi) => setInviter({ envoi })}
                onChange={rafraichir}
              />
            ),
          },
          {
            id: 'permissions',
            libelle: 'Qui peut faire quoi',
            contenu: <MatricePermissions features={features} />,
          },
        ]}
      />

      {membreOuvert && (
        <ModaleMembre
          key={membreOuvert.id}
          membre={membreOuvert}
          moi={utilisateur?.id}
          roleUtilisateur={role}
          type={structure.type}
          onFermer={() => setMembreOuvert(null)}
          onModifie={(message) => {
            setMembreOuvert(null)
            toast.succes(message)
            rafraichir()
          }}
        />
      )}

      {ficheOuverte && (
        <FicheMembre
          key={ficheOuverte.id}
          orgId={orgId}
          membre={ficheOuverte}
          onFermer={() => setFicheOuverte(null)}
          onModifie={() => queryClient.invalidateQueries({ queryKey: cles.membres(orgId) })}
        />
      )}

      {inviter && (
        <ModaleInviter
          structure={structure}
          roleUtilisateur={role}
          envoiInitial={inviter.envoi}
          onFermer={() => setInviter(null)}
          onCree={rafraichir}
        />
      )}
    </div>
  )
}
