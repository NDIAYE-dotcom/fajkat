import Button from '../../../../components/ui/Button/Button.jsx'
import AppelFinal from '../AppelFinal/AppelFinal.jsx'
import EnteteOffre from '../EnteteOffre/EnteteOffre.jsx'
import EtatAvancement from '../EtatAvancement/EtatAvancement.jsx'
import PiedDePage from '../PiedDePage/PiedDePage.jsx'
import PrixOffre from '../PrixOffre/PrixOffre.jsx'
import RegistreModules from '../RegistreModules/RegistreModules.jsx'
import './OffreClinique.css'

const NUMEROS_POLES = ['I', 'II', 'III', 'IV', 'V', 'VI']

const EQUIPES = [
  {
    role: 'Direction',
    texte: 'Une vue d’ensemble de l’activité, des recettes et des stocks, service par service.',
  },
  {
    role: 'Praticiens',
    texte: 'Leur agenda, leurs patients et l’historique du dossier avant chaque consultation.',
  },
  {
    role: 'Accueil et caisse',
    texte: 'Rendez-vous, encaissements et documents, sans aller chercher l’information ailleurs.',
  },
]

function pluriel(nombre, mot) {
  return `${nombre} ${mot}${nombre > 1 ? 's' : ''}`
}

export default function OffreClinique({ offre }) {
  // Numérotation continue des modules d'un pôle à l'autre.
  const poles = offre.poles.map((pole, index) => ({
    ...pole,
    numero: NUMEROS_POLES[index],
    debut:
      1 + offre.poles.slice(0, index).reduce((total, p) => total + p.fonctionnalites.length, 0),
  }))

  return (
    <>
      <EnteteOffre />

      <main className="offre-clinique">
        <section className="offre-clinique__entree" aria-labelledby="titre-page">
          <div className="offre-clinique__accroche">
            <p className="offre-clinique__surtitre">Offre {offre.nom}</p>
            <h1 id="titre-page" className="offre-clinique__titre" tabIndex={-1}>
              Plusieurs services, un seul dossier patient.
            </h1>
            <p className="offre-clinique__chapeau">
              De l’accueil à la facturation, Fajkat est conçu pour relier les praticiens, les
              services et l’administration de votre clinique, sans ressaisie d’un bureau à l’autre.
            </p>
            <Button href="#tarif" variante="secondaire">
              Voir le tarif
            </Button>
          </div>

          <nav className="sommaire-clinique" aria-label="Sommaire de l’offre Clinique">
            <p className="sommaire-clinique__titre">Au sommaire</p>
            <ol className="sommaire-clinique__liste">
              {poles.map((pole) => (
                <li key={pole.id}>
                  <a href={`#pole-${pole.id}`} className="sommaire-clinique__lien">
                    <span className="sommaire-clinique__numero" aria-hidden="true">
                      {pole.numero}
                    </span>
                    <span className="sommaire-clinique__nom">{pole.titre}</span>
                    <span className="sommaire-clinique__compte">
                      {pluriel(pole.fonctionnalites.length, 'module')}
                    </span>
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        </section>

        <section id="tarif" className="offre-clinique__tarif" aria-label="Tarif">
          <div className="offre-clinique__conteneur">
            <PrixOffre
              offre={offre}
              disposition="bande"
              notes={[
                'Un abonnement pour la clinique, avec ses services et ses praticiens.',
                'Règlement mensuel prévu par Wave, Orange Money, Free Money ou carte.',
              ]}
            />
          </div>
        </section>

        <section id="modules" className="offre-clinique__modules" aria-labelledby="modules-titre">
          <div className="offre-clinique__conteneur">
            <h2 id="modules-titre" className="offre-clinique__h2">
              Ce que comprend l’offre {offre.nom}
            </h2>
            <EtatAvancement offre={offre} />

            {poles.map((pole) => (
              <section
                key={pole.id}
                id={`pole-${pole.id}`}
                className="offre-clinique__pole"
                aria-labelledby={`pole-${pole.id}-titre`}
              >
                <div className="offre-clinique__pole-tete">
                  <p className="offre-clinique__pole-numero" aria-hidden="true">
                    {pole.numero}
                  </p>
                  <h3 id={`pole-${pole.id}-titre`} className="offre-clinique__pole-titre">
                    {pole.titre}
                  </h3>
                  <p className="offre-clinique__pole-intro">{pole.intro}</p>
                </div>
                <RegistreModules
                  fonctionnalites={pole.fonctionnalites}
                  debut={pole.debut}
                  niveauTitre={4}
                />
              </section>
            ))}
          </div>
        </section>

        <section className="offre-clinique__equipes" aria-labelledby="equipes-titre">
          <div className="offre-clinique__conteneur">
            <h2 id="equipes-titre" className="offre-clinique__h2">
              Chacun retrouve ce qui le concerne
            </h2>
            <dl className="offre-clinique__roles">
              {EQUIPES.map((equipe) => (
                <div key={equipe.role} className="offre-clinique__role">
                  <dt className="offre-clinique__role-nom">{equipe.role}</dt>
                  <dd className="offre-clinique__role-texte">{equipe.texte}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <AppelFinal
          titre="Préparez l’inscription de votre clinique."
          autreType="poste_sante"
          questionAutre="Vous gérez plutôt un poste de santé ?"
        />
      </main>

      <PiedDePage />
    </>
  )
}
