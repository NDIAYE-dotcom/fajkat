import { useId } from 'react'
import { formatFCFA } from '../../../lib/format.js'
import EmptyState from '../EmptyState/EmptyState.jsx'
import Skeleton from '../Skeleton/Skeleton.jsx'
import './Table.css'

// Tableau façon registre : filets fins, en-têtes collants, survol de ligne.
// Sous 640 px, chaque ligne devient une carte (libellé de colonne à gauche, valeur à droite).
// colonnes : [{ cle, titre, type?: 'texte' | 'nombre' | 'montant', rendu?(ligne),
//               principale?: true (titre de la carte), masquerMobile?: true }]
export default function Table({
  colonnes,
  lignes = [],
  cleLigne = 'id',
  legende,
  legendeVisible = false,
  chargement = false,
  lignesChargement = 5,
  vide,
  hauteurMax = '70vh',
  className = '',
}) {
  const idLegende = useId()

  function valeur(colonne, ligne) {
    if (colonne.rendu) return colonne.rendu(ligne)
    const brute = ligne[colonne.cle]
    return colonne.type === 'montant' ? formatFCFA(brute) : brute
  }

  function classesCellule(colonne, base = 'table__cellule') {
    return [
      base,
      colonne.type && colonne.type !== 'texte' && 'table__cellule--chiffres',
      colonne.principale && 'table__cellule--principale',
      colonne.masquerMobile && 'table__cellule--masquee-mobile',
    ]
      .filter(Boolean)
      .join(' ')
  }

  let corps
  if (chargement) {
    corps = Array.from({ length: lignesChargement }, (_, i) => (
      <tr key={i} className="table__ligne">
        {colonnes.map((colonne) => (
          <td key={colonne.cle} className={classesCellule(colonne)}>
            <Skeleton largeur={colonne.principale ? '70%' : '50%'} />
          </td>
        ))}
      </tr>
    ))
  } else if (lignes.length === 0) {
    corps = (
      <tr>
        <td colSpan={colonnes.length} className="table__vide">
          {vide ?? <EmptyState titre="Aucune ligne à afficher" />}
        </td>
      </tr>
    )
  } else {
    corps = lignes.map((ligne) => (
      <tr key={ligne[cleLigne]} className="table__ligne">
        {colonnes.map((colonne) => {
          const Cellule = colonne.principale ? 'th' : 'td'
          return (
            <Cellule
              key={colonne.cle}
              scope={colonne.principale ? 'row' : undefined}
              data-label={colonne.titre}
              className={classesCellule(colonne)}
            >
              {valeur(colonne, ligne)}
            </Cellule>
          )
        })}
      </tr>
    ))
  }

  return (
    <div
      className={`table ${className}`.trim()}
      role="region"
      aria-labelledby={idLegende}
      tabIndex={0}
      style={{ '--table-hauteur': hauteurMax }}
    >
      <table className="table__tableau" aria-busy={chargement || undefined}>
        <caption id={idLegende} className={legendeVisible ? 'table__legende' : 'sr-only'}>
          {legende}
          {chargement && <span className="sr-only"> (chargement en cours)</span>}
        </caption>
        <thead>
          <tr>
            {colonnes.map((colonne) => (
              <th
                key={colonne.cle}
                scope="col"
                className={classesCellule(colonne, 'table__entete')}
                style={{ width: colonne.largeur }}
              >
                {colonne.titre}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{corps}</tbody>
      </table>
    </div>
  )
}
