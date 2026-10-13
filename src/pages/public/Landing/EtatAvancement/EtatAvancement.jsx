import StatutModule from '../../../../components/ui/StatutModule/StatutModule.jsx'
import { STATUTS_MODULE } from '../../../../lib/offres.js'
import './EtatAvancement.css'

// Explique honnêtement où en est chaque module, avec la légende des statuts.
export default function EtatAvancement({ offre }) {
  return (
    <div className="etat-avancement">
      <p className="etat-avancement__texte">
        Fajkat est en cours de développement. Les modules ci-dessous forment le périmètre de l’offre{' '}
        {offre.nom}&nbsp;: chacun passera à «&nbsp;{STATUTS_MODULE.disponible.libelle}
        &nbsp;» seulement une fois développé, testé et validé.
      </p>
      <dl className="etat-avancement__legende">
        {Object.entries(STATUTS_MODULE).map(([code, statut]) => (
          <div key={code} className="etat-avancement__entree">
            <dt>
              <StatutModule statut={code} />
            </dt>
            <dd>{statut.description}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
