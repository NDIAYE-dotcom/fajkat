import { useId, useRef, useState } from 'react'
import './Tabs.css'

// Onglets (motif WAI-ARIA) : flèches gauche / droite, Début, Fin.
// onglets : [{ id, libelle, compteur?, contenu }]. Contrôlé (actif + onChange) ou autonome.
// Les panneaux inactifs restent montés (masqués) : la saisie d'un onglet n'est pas perdue.
export default function Tabs({ onglets, actif, onChange, libelle, className = '' }) {
  const base = useId()
  const [interne, setInterne] = useState(onglets[0]?.id)
  const courant = actif ?? interne
  const boutons = useRef({})

  function activer(id) {
    if (actif === undefined) setInterne(id)
    onChange?.(id)
  }

  function surTouche(evenement, index) {
    const dernier = onglets.length - 1
    const cibles = {
      ArrowRight: index === dernier ? 0 : index + 1,
      ArrowLeft: index === 0 ? dernier : index - 1,
      Home: 0,
      End: dernier,
    }
    const cible = cibles[evenement.key]
    if (cible === undefined) return
    evenement.preventDefault()
    const id = onglets[cible].id
    activer(id)
    boutons.current[id]?.focus()
  }

  return (
    <div className={`tabs ${className}`.trim()}>
      <div className="tabs__liste" role="tablist" aria-label={libelle}>
        {onglets.map((onglet, index) => {
          const selectionne = onglet.id === courant
          return (
            <button
              key={onglet.id}
              ref={(noeud) => {
                boutons.current[onglet.id] = noeud
              }}
              type="button"
              role="tab"
              id={`${base}-onglet-${onglet.id}`}
              aria-selected={selectionne}
              aria-controls={`${base}-panneau-${onglet.id}`}
              tabIndex={selectionne ? 0 : -1}
              className={`tabs__onglet${selectionne ? ' tabs__onglet--actif' : ''}`}
              onClick={() => activer(onglet.id)}
              onKeyDown={(evenement) => surTouche(evenement, index)}
            >
              {onglet.libelle}
              {onglet.compteur !== undefined && (
                <span className="tabs__compteur">{onglet.compteur}</span>
              )}
            </button>
          )
        })}
      </div>

      {onglets.map((onglet) => (
        <div
          key={onglet.id}
          role="tabpanel"
          id={`${base}-panneau-${onglet.id}`}
          aria-labelledby={`${base}-onglet-${onglet.id}`}
          tabIndex={0}
          hidden={onglet.id !== courant}
          className="tabs__panneau"
        >
          {onglet.contenu}
        </div>
      ))}
    </div>
  )
}
