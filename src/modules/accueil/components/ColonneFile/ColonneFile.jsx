import { useState } from 'react'
import CarteFile from '../CarteFile/CarteFile.jsx'
import './ColonneFile.css'

// Colonne du tableau, zone de dépôt du glisser-déposer (souris). Les mêmes déplacements
// existent en boutons sur chaque carte.
export default function ColonneFile({
  colonne,
  lignes,
  active,
  maintenant,
  ecrire,
  medical,
  horsLigne,
  occupation,
  onAction,
  onDeposer,
}) {
  const [survol, setSurvol] = useState(false)
  const classes = [
    'colonne-file',
    active && 'colonne-file--active',
    survol && 'colonne-file--survol',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <section
      className={classes}
      aria-labelledby={`colonne-${colonne.id}`}
      onDragOver={(e) => {
        if (!ecrire || horsLigne) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        setSurvol(true)
      }}
      onDragLeave={() => setSurvol(false)}
      onDrop={(e) => {
        e.preventDefault()
        setSurvol(false)
        const id = e.dataTransfer.getData('text/plain')
        if (id) onDeposer(id, colonne.id)
      }}
    >
      <h2 id={`colonne-${colonne.id}`} className="colonne-file__titre">
        {colonne.titre} <span className="colonne-file__compte">{lignes.length}</span>
      </h2>
      {lignes.length === 0 ? (
        <p className="colonne-file__vide">Personne</p>
      ) : (
        <ul className="colonne-file__liste">
          {lignes.map((l) => (
            <CarteFile
              key={l.visit_id}
              ligne={l}
              maintenant={maintenant}
              ecrire={ecrire}
              medical={medical}
              horsLigne={horsLigne}
              occupe={occupation?.visitId === l.visit_id ? occupation.action : null}
              onAction={onAction}
            />
          ))}
        </ul>
      )}
    </section>
  )
}
