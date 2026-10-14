import { CircleHelp, Inbox, UserPlus } from 'lucide-react'
import { useState } from 'react'
import Avatar from '../../../../components/ui/Avatar/Avatar.jsx'
import BoutonIcone from '../../../../components/ui/BoutonIcone/BoutonIcone.jsx'
import Button from '../../../../components/ui/Button/Button.jsx'
import EmptyState from '../../../../components/ui/EmptyState/EmptyState.jsx'
import Icone from '../../../../components/ui/Icone/Icone.jsx'
import Pagination from '../../../../components/ui/Pagination/Pagination.jsx'
import Panel from '../../../../components/ui/Panel/Panel.jsx'
import Skeleton from '../../../../components/ui/Skeleton/Skeleton.jsx'
import StepIndicator from '../../../../components/ui/StepIndicator/StepIndicator.jsx'
import Tabs from '../../../../components/ui/Tabs/Tabs.jsx'
import Tooltip from '../../../../components/ui/Tooltip/Tooltip.jsx'
import Demo from '../../Demo/Demo.jsx'
import SectionAtelier from '../../SectionAtelier/SectionAtelier.jsx'
import './Affichage.css'

const AIDE_TDR = 'TDR : test de diagnostic rapide du paludisme, résultat en 15 minutes.'

export default function Affichage() {
  const [page, setPage] = useState(3)
  const [etape, setEtape] = useState(1)

  return (
    <SectionAtelier
      id="affichage"
      titre="Panneaux et navigation"
      intro="Panneaux, onglets, progression, pagination, états vides et de chargement."
    >
      <Demo titre="Panneaux">
        <div className="affichage__panneaux">
          <Panel
            titre="Awa Diop"
            sousTitre="27 ans · Médina · Dossier PS-2026-0142"
            marque
            actions={<Button variante="secondaire">Modifier</Button>}
            pied={<span className="affichage__discret">Dernière visite : 13/10/2026</span>}
          >
            CPN 3 prévue le 04/11/2026. Marge colorée : panneau important.
          </Panel>
          <Panel titre="Caisse du jour" ton="surface" niveau={3}>
            Panneau secondaire sur fond menthe.
          </Panel>
        </div>
      </Demo>

      <Demo
        titre="Onglets"
        note="Flèches gauche / droite, Début, Fin. Les onglets défilent sur téléphone."
      >
        <Tabs
          libelle="Dossier du patient"
          onglets={[
            { id: 'resume', libelle: 'Résumé', contenu: <p>Résumé du dossier.</p> },
            {
              id: 'consultations',
              libelle: 'Consultations',
              compteur: 4,
              contenu: <p>4 consultations.</p>,
            },
            {
              id: 'vaccins',
              libelle: 'Vaccins',
              compteur: 7,
              contenu: <p>Carnet de vaccination.</p>,
            },
            { id: 'paiements', libelle: 'Paiements', contenu: <p>Historique des paiements.</p> },
          ]}
        />
      </Demo>

      <Demo
        titre="Progression d'un formulaire"
        note="Sur téléphone : « Étape 2 sur 4 » et le libellé courant."
      >
        <div className="affichage__pleine-largeur">
          <StepIndicator
            etapes={['Identité', 'Contact', 'Prise en charge', 'Vérification']}
            courante={etape}
          />
          <div className="affichage__actions">
            <Button
              variante="secondaire"
              disabled={etape === 0}
              onClick={() => setEtape(etape - 1)}
            >
              Étape précédente
            </Button>
            <Button disabled={etape === 3} onClick={() => setEtape(etape + 1)}>
              Étape suivante
            </Button>
          </div>
        </div>
      </Demo>

      <Demo titre="Pagination">
        <div className="affichage__pleine-largeur">
          <Pagination page={page} totalPages={12} total={234} parPage={20} onChange={setPage} />
        </div>
      </Demo>

      <Demo
        titre="Avatars"
        etats={[
          { libelle: 'Petit', contenu: <Avatar nom="Khady Diallo" taille="s" /> },
          { libelle: 'Moyen', contenu: <Avatar nom="Mamadou Lamine Ndiaye" /> },
          { libelle: 'Grand', contenu: <Avatar nom="Fatou Sow" taille="l" /> },
        ]}
      />

      <Demo
        titre="Chargement et état vide"
        etats={[
          {
            libelle: 'Chargement',
            contenu: (
              <div className="affichage__squelette" aria-busy="true">
                <span className="sr-only">Chargement du dossier…</span>
                <Skeleton forme="cercle" />
                <Skeleton forme="titre" />
                <Skeleton />
                <Skeleton largeur="80%" />
              </div>
            ),
          },
          {
            libelle: 'Vide',
            contenu: (
              <EmptyState
                icone={Inbox}
                titre="Aucun patient en attente"
                texte="Les patients enregistrés à l'accueil apparaîtront ici."
                action={
                  <Button iconeDebut={<Icone icone={UserPlus} />}>Enregistrer un patient</Button>
                }
              />
            ),
          },
        ]}
      />

      <Demo
        titre="Info-bulles près des bords"
        note="Sur un téléphone de 360 px, la bulle se décale pour rester entière ; sa pointe reste face au bouton."
      >
        <div className="affichage__bords">
          {['bord gauche', 'centre', 'bord droit'].map((place) => (
            <Tooltip key={place} texte={AIDE_TDR}>
              <BoutonIcone icone={CircleHelp} label={`Aide (${place})`} />
            </Tooltip>
          ))}
        </div>
        <Tooltip texte="Sans place au-dessus, la bulle passe dessous." position="haut">
          <Button variante="secondaire">Info-bulle en haut</Button>
        </Tooltip>
      </Demo>
    </SectionAtelier>
  )
}
