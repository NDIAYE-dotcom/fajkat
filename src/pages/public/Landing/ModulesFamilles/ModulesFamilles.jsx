import { ChevronDown } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import StatutModule from '../../../../components/ui/StatutModule/StatutModule.jsx'
import { useVisible } from '../../../../hooks/useVisible.js'
import { famillesOffre } from '../../../../lib/offres.js'
import { FRAGMENTS } from '../Parcours/fragments.js'
import ApercuModule from './ApercuModule/ApercuModule.jsx'
import { apercuModule } from './apercus.js'
import './ModulesFamilles.css'

// Aperçu d'écran d'un module : fragment du parcours ou aperçu générique (données fictives).
function Apercu({ code, type, actif }) {
  const apercu = apercuModule(code, type)
  if (!apercu) return null
  if (apercu.fragment) {
    const Fragment = FRAGMENTS[apercu.fragment]
    return <Fragment actif={actif} />
  }
  return <ApercuModule {...apercu} actif={actif} />
}

// Modules de l'offre rangés par famille, dans trois onglets (motif ARIA tablist / tab / tabpanel).
// Grand écran : liste à gauche, aperçu du module sélectionné à droite.
// Téléphone : la liste devient un accordéon, l'aperçu s'ouvre sous le module choisi.
export default function ModulesFamilles({ offre }) {
  const familles = famillesOffre(offre)
  const [onglet, setOnglet] = useState(0)
  const [selection, setSelection] = useState(familles[0].fonctionnalites[0].code)
  const onglets = useRef([])
  const zone = useRef(null)
  const visible = useVisible(zone)
  const id = useId()
  const { hash, key } = useLocation()

  // Lien du menu « Plateforme » (#module-code) : on ouvre le bon onglet et le bon module,
  // puis on l'amène à l'écran une fois l'onglet affiché.
  useEffect(() => {
    const code = hash.startsWith('#module-') ? decodeURIComponent(hash.slice(8)) : null
    const index = familles.findIndex((f) => f.fonctionnalites.some((m) => m.code === code))
    if (index === -1) return undefined
    const image = requestAnimationFrame(() => {
      setOnglet(index)
      setSelection(code)
      setTimeout(() => {
        document.getElementById(`module-${code}`)?.scrollIntoView({ block: 'center' })
      }, 60)
    })
    return () => cancelAnimationFrame(image)
    // familles dépend de l'offre : la page est remontée à chaque changement d'offre.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hash, key])

  function choisirOnglet(index, { focus = false } = {}) {
    setOnglet(index)
    setSelection(familles[index].fonctionnalites[0].code)
    if (focus) onglets.current[index]?.focus()
  }

  // Flèches gauche / droite, Début / Fin : l'onglet suivant est activé et reçoit le focus.
  function surToucheOnglet(evenement, index) {
    const dernier = familles.length - 1
    const cibles = {
      ArrowRight: index === dernier ? 0 : index + 1,
      ArrowLeft: index === 0 ? dernier : index - 1,
      Home: 0,
      End: dernier,
    }
    if (!(evenement.key in cibles)) return
    evenement.preventDefault()
    choisirOnglet(cibles[evenement.key], { focus: true })
  }

  return (
    <div ref={zone} className="modules-familles">
      <div className="modules-familles__onglets" role="tablist" aria-label="Familles de modules">
        {familles.map((famille, index) => (
          <button
            key={famille.id}
            ref={(element) => {
              onglets.current[index] = element
            }}
            type="button"
            role="tab"
            id={`${id}-onglet-${index}`}
            aria-controls={`${id}-panneau-${index}`}
            aria-selected={index === onglet}
            tabIndex={index === onglet ? 0 : -1}
            className="modules-familles__onglet"
            onClick={() => choisirOnglet(index)}
            onKeyDown={(evenement) => surToucheOnglet(evenement, index)}
          >
            {famille.titre}
            <span className="modules-familles__compte">{famille.fonctionnalites.length}</span>
          </button>
        ))}
      </div>

      {familles.map((famille, index) => (
        <div
          key={famille.id}
          role="tabpanel"
          id={`${id}-panneau-${index}`}
          aria-labelledby={`${id}-onglet-${index}`}
          hidden={index !== onglet}
          className="modules-familles__panneau"
        >
          <p className="modules-familles__intro">{famille.intro}</p>
          <div className="modules-familles__grille">
            <ul className="modules-familles__liste">
              {famille.fonctionnalites.map((module) => {
                const ouvert = module.code === selection
                const idDetail = `${id}-${module.code}`
                return (
                  <li
                    key={module.code}
                    id={`module-${module.code}`}
                    className="modules-familles__module"
                  >
                    <button
                      type="button"
                      className="modules-familles__bouton"
                      aria-expanded={ouvert}
                      aria-controls={idDetail}
                      onClick={() => setSelection(module.code)}
                    >
                      <span className="modules-familles__titre">{module.titre}</span>
                      {module.phare && <span className="modules-familles__phare">Phare</span>}
                      <StatutModule statut={module.statut} />
                      <ChevronDown
                        className="modules-familles__chevron"
                        size={18}
                        aria-hidden="true"
                      />
                    </button>
                    <div id={idDetail} className="modules-familles__detail" hidden={!ouvert}>
                      <p className="modules-familles__description">{module.description}</p>
                      {module.reserve && (
                        <p className="modules-familles__reserve">{module.reserve}</p>
                      )}
                      {/* Téléphone : l'aperçu s'affiche ici, sous le module ouvert */}
                      {ouvert && index === onglet && (
                        <div className="modules-familles__apercu-mobile" aria-hidden="true">
                          <Apercu code={module.code} type={offre.type} actif={visible} />
                        </div>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>

            {/* Grand écran : aperçu à droite ; la clé relance le fondu à chaque changement */}
            {index === onglet && (
              <div className="modules-familles__apercu" aria-hidden="true">
                <div key={selection} className="modules-familles__ecran">
                  <Apercu code={selection} type={offre.type} actif={visible} />
                  <p className="modules-familles__mention">Aperçu — données fictives</p>
                </div>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
