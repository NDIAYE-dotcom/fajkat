import { autreOffre, famillesOffre } from '../../../../lib/offres.js'
import AppelDemo from '../AppelDemo/AppelDemo.jsx'
import AppelFinal from '../AppelFinal/AppelFinal.jsx'
import Atouts from '../Atouts/Atouts.jsx'
import EtatAvancement from '../EtatAvancement/EtatAvancement.jsx'
import HerosOffre from '../HerosOffre/HerosOffre.jsx'
import Parcours from '../Parcours/Parcours.jsx'
import PiedDePage from '../PiedDePage/PiedDePage.jsx'
import PrixOffre from '../PrixOffre/PrixOffre.jsx'
import RegistreModules from '../RegistreModules/RegistreModules.jsx'
import { CONTENU_OFFRES } from './contenu.js'
import './PageOffre.css'

const NUMEROS_FAMILLES = ['I', 'II', 'III']

// Page d'une offre, commune aux deux offres : seul le contenu (contenu.js) et la couleur changent.
// Démo proposée en haut (héros), au milieu (après le parcours) et en bas (appel final).
export default function PageOffre({ offre }) {
  const contenu = CONTENU_OFFRES[offre.type]

  // Numérotation continue des modules d'une famille à l'autre.
  const familles = famillesOffre(offre)
  const debuts = familles.map(
    (_, index) =>
      1 + familles.slice(0, index).reduce((total, f) => total + f.fonctionnalites.length, 0),
  )

  return (
    <>
      <main className={`page-offre page-offre--${offre.type}`}>
        <HerosOffre offre={offre} heros={contenu.heros} />
        <Parcours parcours={contenu.parcours} />
        <AppelDemo offre={offre} />

        <section id="modules" className="page-offre__modules" aria-labelledby="modules-titre">
          <div className="page-offre__conteneur">
            <h2 id="modules-titre" className="page-offre__h2">
              Ce que comprend l’offre {offre.nom}
            </h2>
            <EtatAvancement offre={offre} />

            {familles.map((famille, index) => (
              <section
                key={famille.id}
                className="page-offre__famille"
                aria-labelledby={`famille-${famille.id}`}
              >
                <div className="page-offre__famille-tete">
                  <p className="page-offre__famille-numero" aria-hidden="true">
                    {NUMEROS_FAMILLES[index]}
                  </p>
                  <h3 id={`famille-${famille.id}`} className="page-offre__famille-titre">
                    {famille.titre}
                  </h3>
                  <p className="page-offre__famille-intro">{famille.intro}</p>
                </div>
                <RegistreModules
                  fonctionnalites={famille.fonctionnalites}
                  debut={debuts[index]}
                  niveauTitre={4}
                />
              </section>
            ))}
          </div>
        </section>

        <section id="tarif" className="page-offre__tarif" aria-label="Tarif">
          <div className="page-offre__conteneur">
            <PrixOffre offre={offre} disposition="bande" notes={contenu.notesTarif} />
          </div>
        </section>

        <Atouts atouts={contenu.atouts} />

        <AppelFinal
          titre={contenu.appelFinal}
          autreType={autreOffre(offre.type).type}
          questionAutre={contenu.questionAutre}
        />
      </main>

      <PiedDePage />
    </>
  )
}
