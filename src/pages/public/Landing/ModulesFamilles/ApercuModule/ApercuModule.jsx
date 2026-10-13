import CarteFragment from '../../Parcours/CarteFragment/CarteFragment.jsx'
import './ApercuModule.css'

// Aperçu générique d'un module : fenêtre du parcours et lignes qui arrivent l'une après l'autre.
export default function ApercuModule({ icone, titre, precision, lignes, pied, actif }) {
  return (
    <CarteFragment icone={icone} titre={titre} precision={precision} actif={actif}>
      <ul className="apercu-module">
        {lignes.map((ligne, index) => (
          <li
            key={`${ligne.libelle}-${index}`}
            className="apercu-module__ligne"
            style={{ '--i': index }}
          >
            <span className="apercu-module__texte">
              <span className="apercu-module__libelle">{ligne.libelle}</span>
              {ligne.detail && <span className="apercu-module__detail">{ligne.detail}</span>}
            </span>
            {ligne.valeur && <span className="apercu-module__valeur">{ligne.valeur}</span>}
            {ligne.badge && (
              <span className="apercu-module__badge" data-alerte={ligne.alerte || undefined}>
                {ligne.badge}
              </span>
            )}
          </li>
        ))}
      </ul>
      {pied && <p className="apercu-module__pied">{pied}</p>}
    </CarteFragment>
  )
}
