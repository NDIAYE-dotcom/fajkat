import './Demo.css'

// Démonstration d'un composant. Avec « etats », une grille montre chaque état côte à côte :
// [{ libelle: 'Survol', contenu: <… data-etat="survol" /> }]. Sinon, le contenu libre est affiché.
export default function Demo({ titre, note, etats, children }) {
  return (
    <div className="demo">
      <h3 className="demo__titre">{titre}</h3>
      {note && <p className="demo__note">{note}</p>}
      {etats ? (
        <ul className="demo__grille">
          {etats.map((etat) => (
            <li key={etat.libelle} className="demo__case">
              <p className="demo__etat">{etat.libelle}</p>
              {etat.contenu}
            </li>
          ))}
        </ul>
      ) : (
        <div className="demo__libre">{children}</div>
      )}
    </div>
  )
}
