import StatutModule from '../../../../components/ui/StatutModule/StatutModule.jsx'
import './RegistreModules.css'

// Liste des modules présentée comme les lignes numérotées d'un registre.
// « debut » permet de poursuivre la numérotation d'un bloc à l'autre.
export default function RegistreModules({ fonctionnalites, debut = 1, niveauTitre = 3 }) {
  const Titre = `h${niveauTitre}`

  return (
    <ol className="registre-modules" start={debut}>
      {fonctionnalites.map((f, index) => (
        <li key={f.code} id={`module-${f.code}`} className="registre-modules__ligne">
          <span className="registre-modules__numero" aria-hidden="true">
            {String(debut + index).padStart(2, '0')}
          </span>
          <div className="registre-modules__corps">
            <Titre className="registre-modules__titre">{f.titre}</Titre>
            <p className="registre-modules__description">{f.description}</p>
            {f.reserve && <p className="registre-modules__reserve">{f.reserve}</p>}
          </div>
          <span className="registre-modules__statut">
            <StatutModule statut={f.statut} />
          </span>
        </li>
      ))}
    </ol>
  )
}
