import { ArrowRight, Printer, Search, Trash2, UserPlus, X } from 'lucide-react'
import BoutonIcone from '../../../../components/ui/BoutonIcone/BoutonIcone.jsx'
import Button from '../../../../components/ui/Button/Button.jsx'
import Icone from '../../../../components/ui/Icone/Icone.jsx'
import Spinner from '../../../../components/ui/Spinner/Spinner.jsx'
import Tampon from '../../../../components/ui/Tampon/Tampon.jsx'
import Demo from '../../Demo/Demo.jsx'
import SectionAtelier from '../../SectionAtelier/SectionAtelier.jsx'

// États communs à chaque variante de bouton
function etatsBouton(variante, icone) {
  const commun = { variante, iconeDebut: <Icone icone={icone} /> }
  return [
    { libelle: 'Normal', contenu: <Button {...commun}>Nouveau patient</Button> },
    {
      libelle: 'Survol',
      contenu: (
        <Button {...commun} data-etat="survol">
          Nouveau patient
        </Button>
      ),
    },
    {
      libelle: 'Focus',
      contenu: (
        <Button {...commun} data-etat="focus">
          Nouveau patient
        </Button>
      ),
    },
    {
      libelle: 'Désactivé',
      contenu: (
        <Button {...commun} disabled>
          Nouveau patient
        </Button>
      ),
    },
    {
      libelle: 'Chargement',
      contenu: (
        <Button {...commun} chargement>
          Enregistrement…
        </Button>
      ),
    },
  ]
}

export default function Boutons() {
  return (
    <SectionAtelier
      id="boutons"
      titre="Boutons, icônes et tampons"
      intro="Un seul bouton principal par écran. Les icônes accompagnent un texte ; seules les actions secondaires évidentes se contentent d'une icône, avec un nom lu par les lecteurs d'écran."
    >
      <Demo titre="Bouton primaire" etats={etatsBouton('primaire', UserPlus)} />
      <Demo titre="Bouton secondaire" etats={etatsBouton('secondaire', Printer)} />
      <Demo titre="Bouton discret (lien)" etats={etatsBouton('discret', Search)} />

      <Demo titre="Grand bouton avec flèche">
        <Button taille="grande" iconeFin={<Icone icone={ArrowRight} />}>
          Valider le passage en caisse
        </Button>
      </Demo>

      <Demo
        titre="Bouton icône"
        note="44 × 44 px, libellé obligatoire (aria-label). Réservé à fermer, effacer, retirer."
        etats={[
          { libelle: 'Normal', contenu: <BoutonIcone icone={X} label="Fermer" /> },
          {
            libelle: 'Survol',
            contenu: <BoutonIcone icone={X} label="Fermer" data-etat="survol" />,
          },
          { libelle: 'Focus', contenu: <BoutonIcone icone={X} label="Fermer" data-etat="focus" /> },
          {
            libelle: 'Désactivé',
            contenu: <BoutonIcone icone={Trash2} label="Retirer" disabled />,
          },
        ]}
      />

      <Demo
        titre="Icônes"
        note="lucide-react, 20 px, trait 1,5, couleur du texte voisin."
        etats={[
          {
            libelle: 'Avec texte visible',
            contenu: (
              <span>
                <Icone icone={Printer} /> Imprimer le reçu
              </span>
            ),
          },
          {
            libelle: 'Seule, avec libellé',
            contenu: <Icone icone={Search} label="Recherche" />,
          },
          {
            libelle: 'Chargement',
            contenu: <Spinner libelle="Chargement en cours" />,
          },
        ]}
      />

      <Demo
        titre="Tampons de statut"
        note="Le mot reste toujours écrit : lisible imprimé en noir et blanc."
      >
        <Tampon statut="paye" />
        <Tampon statut="urgent" />
        <Tampon statut="vaccine" />
        <Tampon statut="refere" />
        <Tampon statut="annule" />
      </Demo>
    </SectionAtelier>
  )
}
