import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useOffre } from '../../../../../hooks/useOffre.js'
import { OFFRES, TYPES_OFFRE, famillesOffre, getOffre } from '../../../../../lib/offres.js'
import './ListePlateforme.css'

// Contenu du menu « Plateforme » : les modules rangés en trois familles.
// Une offre choisie : seuls ses modules apparaissent. Sinon, le visiteur bascule entre les deux.
export default function ListePlateforme({ onNaviguer, idPrefixe = 'plateforme' }) {
  const { offre, derniereOffre } = useOffre()
  const [typeConsulte, setTypeConsulte] = useState(derniereOffre ?? TYPES_OFFRE[0])
  const affichee = offre ?? getOffre(typeConsulte)

  return (
    <div className="liste-plateforme" data-offre={affichee.type}>
      {!offre && (
        <div className="liste-plateforme__bascule" role="group" aria-label="Modules de l’offre">
          {TYPES_OFFRE.map((type) => (
            <button
              key={type}
              type="button"
              className="liste-plateforme__onglet"
              data-offre={type}
              aria-pressed={type === affichee.type}
              onClick={() => setTypeConsulte(type)}
            >
              {OFFRES[type].nom}
            </button>
          ))}
        </div>
      )}

      <div className="liste-plateforme__familles">
        {famillesOffre(affichee).map((famille) => {
          const phares = famille.fonctionnalites.filter((f) => f.phare)
          const autres = famille.fonctionnalites.filter((f) => !f.phare)
          const idTitre = `${idPrefixe}-${famille.id}`
          const lien = (f) => ({ pathname: affichee.chemin, hash: `module-${f.code}` })

          return (
            <div
              key={famille.id}
              className="liste-plateforme__famille"
              role="group"
              aria-labelledby={idTitre}
            >
              <p id={idTitre} className="liste-plateforme__titre">
                {famille.titre}
              </p>
              <p className="liste-plateforme__intro">{famille.intro}</p>

              {phares.length > 0 && (
                <ul className="liste-plateforme__phares">
                  {phares.map((f) => (
                    <li key={f.code}>
                      <Link to={lien(f)} className="liste-plateforme__phare" onClick={onNaviguer}>
                        <span className="liste-plateforme__phare-nom">{f.titreCourt}</span>
                        <span className="liste-plateforme__marque">Phare</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}

              {autres.length > 0 && (
                <p className="liste-plateforme__autres">
                  <span className="liste-plateforme__aussi">Aussi&nbsp;: </span>
                  {autres.map((f, index) => (
                    <span key={f.code}>
                      <Link to={lien(f)} className="liste-plateforme__autre" onClick={onNaviguer}>
                        {f.titreCourt}
                      </Link>
                      {index < autres.length - 1 && <span aria-hidden="true"> · </span>}
                    </span>
                  ))}
                </p>
              )}
            </div>
          )
        })}
      </div>

      <p className="liste-plateforme__note">
        Offre {affichee.nom}&nbsp;: {affichee.fonctionnalites.length} modules prévus, en cours de
        développement.
      </p>
    </div>
  )
}
