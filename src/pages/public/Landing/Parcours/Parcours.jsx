import { useEffect, useRef, useState } from 'react'
import { mouvementReduit } from '../../../../lib/mouvement.js'
import { FRAGMENTS } from './fragments.js'
import './Parcours.css'

// Cas concret : un patient fictif suivi étape par étape pendant le défilement.
// Grand écran : les étapes défilent à gauche, la scène reste collée à droite.
// Téléphone : la scène reste collée en haut, les étapes défilent dessous.
// Animations réduites : chaque étape s'affiche avec son fragment, à l'état final, sans scène collante.
export default function Parcours({ parcours }) {
  const [statique] = useState(mouvementReduit)
  const [actif, setActif] = useState(0)
  const etapes = useRef([])

  // L'étape active est celle qui croise une ligne placée un peu sous le milieu de l'écran
  // (sous la scène collante sur téléphone).
  useEffect(() => {
    if (statique || typeof IntersectionObserver === 'undefined') return undefined
    const observateur = new IntersectionObserver(
      (entrees) => {
        for (const entree of entrees) {
          if (entree.isIntersecting) setActif(Number(entree.target.dataset.index))
        }
      },
      { rootMargin: '-58% 0px -38% 0px' },
    )
    etapes.current.forEach((element) => element && observateur.observe(element))
    return () => observateur.disconnect()
  }, [statique])

  const nombre = parcours.etapes.length

  return (
    <section className="parcours" aria-labelledby="parcours-titre">
      <div className="parcours__interieur">
        <header className="parcours__tete">
          <p className="parcours__surtitre">Cas concret</p>
          <h2 id="parcours-titre" className="parcours__titre">
            {parcours.titre}
          </h2>
          <p className="parcours__intro">{parcours.intro}</p>
          <p className="parcours__fictif">Patient fictif · données de démonstration</p>
        </header>

        <div className="parcours__corps" data-statique={statique || undefined}>
          <ol className="parcours__etapes" style={{ '--progression': (actif + 1) / nombre }}>
            {parcours.etapes.map((etape, index) => {
              const Fragment = FRAGMENTS[etape.fragment]
              return (
                <li
                  key={etape.fragment}
                  ref={(element) => {
                    etapes.current[index] = element
                  }}
                  data-index={index}
                  data-actif={(!statique && index === actif) || undefined}
                  className="parcours__etape"
                >
                  <span className="parcours__numero" aria-hidden="true">
                    {index + 1}
                  </span>
                  <p className="parcours__moment">{etape.moment}</p>
                  <h3 className="parcours__etape-titre">{etape.titre}</h3>
                  <p className="parcours__etape-texte">{etape.texte}</p>
                  {statique && (
                    <div className="parcours__fragment-liste" aria-hidden="true">
                      <Fragment actif />
                    </div>
                  )}
                </li>
              )
            })}
          </ol>

          {!statique && (
            <div className="parcours__scene" aria-hidden="true">
              <div className="parcours__ecran">
                {parcours.etapes.map((etape, index) => {
                  const Fragment = FRAGMENTS[etape.fragment]
                  return (
                    <div
                      key={etape.fragment}
                      className="parcours__fragment"
                      data-visible={index === actif || undefined}
                    >
                      <Fragment actif={index === actif} />
                    </div>
                  )
                })}
              </div>
              <span className="parcours__points">
                {parcours.etapes.map((etape, index) => (
                  <span
                    key={etape.fragment}
                    className="parcours__point"
                    data-actif={index === actif || undefined}
                  />
                ))}
              </span>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
