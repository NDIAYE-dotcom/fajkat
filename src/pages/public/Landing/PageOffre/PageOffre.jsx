import { useApparition } from '../../../../hooks/useApparition.js'
import AppelDemo from '../AppelDemo/AppelDemo.jsx'
import AppelFinal from '../AppelFinal/AppelFinal.jsx'
import Atouts from '../Atouts/Atouts.jsx'
import EtatAvancement from '../EtatAvancement/EtatAvancement.jsx'
import FaqOffre from '../FaqOffre/FaqOffre.jsx'
import HerosOffre from '../HerosOffre/HerosOffre.jsx'
import Parcours from '../Parcours/Parcours.jsx'
import ModulesFamilles from '../ModulesFamilles/ModulesFamilles.jsx'
import RecuTarif from '../RecuTarif/RecuTarif.jsx'
import { CONTENU_OFFRES } from './contenu.js'
import { FAQ_OFFRES } from './faq.js'
import './PageOffre.css'

// Page d'une offre, commune aux deux offres : seul le contenu (contenu.js) et la couleur changent.
// Démo proposée en haut (héros), au milieu (après le parcours) et en bas (appel final).
export default function PageOffre({ offre }) {
  const contenu = CONTENU_OFFRES[offre.type]

  const [refModules, modulesApparus] = useApparition()

  return (
    <>
      <main className={`page-offre page-offre--${offre.type}`}>
        <HerosOffre offre={offre} heros={contenu.heros} />
        <Parcours parcours={contenu.parcours} />
        <AppelDemo offre={offre} />

        <section
          ref={refModules}
          id="modules"
          className="page-offre__modules"
          data-apparu={modulesApparus || undefined}
          aria-labelledby="modules-titre"
        >
          <div className="page-offre__conteneur">
            <p className="page-offre__surtitre apparition">Modules</p>
            <h2 id="modules-titre" className="page-offre__h2 apparition" style={{ '--rang': 1 }}>
              Ce que comprend l’offre {offre.nom}
            </h2>
            <div className="page-offre__avancement apparition" style={{ '--rang': 2 }}>
              <EtatAvancement offre={offre} />
            </div>
            <div className="apparition" style={{ '--rang': 3 }}>
              <ModulesFamilles offre={offre} />
            </div>
          </div>
        </section>

        <RecuTarif offre={offre} notes={contenu.notesTarif} />

        <Atouts atouts={contenu.atouts} />

        <FaqOffre questions={FAQ_OFFRES[offre.type]} />

        <AppelFinal
          titre={contenu.appelFinal}
          questionAutre={contenu.questionAutre}
          image={contenu.heros.image}
        />
      </main>
    </>
  )
}
