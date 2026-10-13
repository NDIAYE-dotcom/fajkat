import { Printer, Smartphone, WifiOff } from 'lucide-react'
import Button from '../../../../components/ui/Button/Button.jsx'
import AppelFinal from '../AppelFinal/AppelFinal.jsx'
import EtatAvancement from '../EtatAvancement/EtatAvancement.jsx'
import PiedDePage from '../PiedDePage/PiedDePage.jsx'
import PrixOffre from '../PrixOffre/PrixOffre.jsx'
import RegistreModules from '../RegistreModules/RegistreModules.jsx'
import './OffrePoste.css'

// Les grands moments d'une journée au poste, et les modules prévus pour chacun.
const JOURNEE = [
  {
    moment: 'À l’ouverture',
    titre: 'L’accueil s’organise',
    texte:
      'Chaque patient reçoit son ticket de passage. Les femmes enceintes, les jeunes enfants et les personnes âgées passent en priorité.',
    modules: 'Accueil · Patients',
  },
  {
    moment: 'En consultation',
    titre: 'Le dossier est déjà là',
    texte:
      'Le bon patient est retrouvé malgré les homonymes. La CPN, le vaccin du jour ou le traitement en cours s’affichent sans fouiller les cahiers.',
    modules: 'Consultations · Maternité · Vaccination',
  },
  {
    moment: 'Au dépôt et à la caisse',
    titre: 'Chaque sortie est comptée',
    texte:
      'L’ordonnance passe au dépôt, le stock se met à jour et le paiement est enregistré, en espèces ou par mobile money.',
    modules: 'Dépôt · Stock · Caisse',
  },
  {
    moment: 'À la fermeture',
    titre: 'La journée se clôture',
    texte:
      'La caisse est arrêtée avec son billetage, les ruptures à venir sont signalées et les chiffres du mois se préparent au fil des saisies.',
    modules: 'Caisse · Rapports',
  },
]

const TERRAIN = [
  {
    icone: WifiOff,
    titre: 'Connexion instable',
    texte:
      'Les saisies longues sont conservées en brouillon. Un mode hors connexion est prévu pour les écrans essentiels.',
  },
  {
    icone: Smartphone,
    titre: 'Téléphones modestes',
    texte: 'Des pages légères, lisibles en plein soleil et utilisables sur un petit écran Android.',
  },
  {
    icone: Printer,
    titre: 'Impression au poste',
    texte: 'Documents en A4 ou A5, reçus et tickets de passage au format thermique 80 mm.',
  },
]

export default function OffrePoste({ offre }) {
  return (
    <>
      <main className="offre-poste">
        <section className="offre-poste__entree" aria-labelledby="titre-page">
          <div className="offre-poste__accroche">
            <p className="offre-poste__surtitre">Offre {offre.nom}</p>
            <h1 id="titre-page" className="offre-poste__titre" tabIndex={-1}>
              Tout le poste de santé, tenu dans un seul registre.
            </h1>
            <p className="offre-poste__chapeau">
              Patients, consultations, vaccination, dépôt et caisse&nbsp;: l’ICP, la sage-femme et
              toute l’équipe travaillent sur les mêmes informations, même quand la connexion
              faiblit.
            </p>
            <Button href="#modules" variante="secondaire">
              Voir les modules de l’offre
            </Button>
          </div>

          <PrixOffre
            offre={offre}
            notes={[
              'Règlement mensuel prévu par Wave, Orange Money, Free Money ou carte.',
              'Passage ultérieur à l’offre Clinique sans perte de données.',
            ]}
          />
        </section>

        <section className="offre-poste__journee" aria-labelledby="journee-titre">
          <div className="offre-poste__conteneur">
            <h2 id="journee-titre" className="offre-poste__h2">
              Une journée au poste, telle que Fajkat la prévoit
            </h2>
            <p className="offre-poste__intro">
              Fajkat suit le rythme réel d’un poste de santé, de l’ouverture à la clôture de la
              caisse.
            </p>

            <ol className="offre-poste__etapes">
              {JOURNEE.map((etape) => (
                <li key={etape.moment} className="offre-poste__etape">
                  <p className="offre-poste__moment">{etape.moment}</p>
                  <h3 className="offre-poste__etape-titre">{etape.titre}</h3>
                  <p className="offre-poste__etape-texte">{etape.texte}</p>
                  <p className="offre-poste__etape-modules">{etape.modules}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="modules" className="offre-poste__modules" aria-labelledby="modules-titre">
          <div className="offre-poste__conteneur">
            <h2 id="modules-titre" className="offre-poste__h2">
              Ce que comprend l’offre {offre.nom}
            </h2>
            <EtatAvancement offre={offre} />
            <RegistreModules fonctionnalites={offre.fonctionnalites} />
          </div>
        </section>

        <section className="offre-poste__terrain" aria-labelledby="terrain-titre">
          <div className="offre-poste__conteneur offre-poste__terrain-grille">
            <div>
              <h2 id="terrain-titre" className="offre-poste__h2">
                Pensé pour les conditions du terrain
              </h2>
              <p className="offre-poste__intro">
                Ces principes guident la conception de chaque écran destiné aux petites structures.
              </p>
            </div>
            <ul className="offre-poste__principes">
              {TERRAIN.map(({ icone: Icone, titre, texte }) => (
                <li key={titre} className="offre-poste__principe">
                  <Icone className="offre-poste__principe-icone" size={22} aria-hidden="true" />
                  <div>
                    <h3 className="offre-poste__principe-titre">{titre}</h3>
                    <p className="offre-poste__principe-texte">{texte}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <AppelFinal
          titre="Préparez l’inscription de votre poste de santé."
          autreType="clinique"
          questionAutre="Vous gérez plutôt une clinique ?"
        />
      </main>

      <PiedDePage />
    </>
  )
}
