import { Plus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import Button from '../../../../components/ui/Button/Button.jsx'
import Icone from '../../../../components/ui/Icone/Icone.jsx'
import { COLONNES_REGISTRE, LIGNES_MAX } from '../../import/registre.js'
import LigneRegistre from '../LigneRegistre/LigneRegistre.jsx'
import './GrilleRegistre.css'

// Grille façon page de registre, tout au clavier :
//   Tab / Maj+Tab : case suivante / précédente (ordre naturel) ;
//   Entrée : première case de la ligne suivante, créée si besoin (60 lignes au plus) ;
//   Flèches haut / bas : même colonne, ligne précédente / suivante.
export default function GrilleRegistre({
  lignes,
  erreursLignes,
  onModifier,
  onSupprimer,
  onAjouter,
}) {
  const grille = useRef(null)
  const focusAttendu = useRef(null) // { id, col } d'une ligne pas encore affichée
  const [annonce, setAnnonce] = useState('')
  const pleine = lignes.length >= LIGNES_MAX

  function focaliser({ id, col }) {
    grille.current?.querySelector(`[data-id="${id}"][data-col="${col}"]`)?.focus()
  }

  // La case d'une ligne tout juste créée n'existe qu'après le rendu.
  useEffect(() => {
    if (!focusAttendu.current) return
    focaliser(focusAttendu.current)
    focusAttendu.current = null
  }, [lignes])

  function ajouter(apresIndex) {
    const id = onAjouter(apresIndex)
    if (id === null) {
      setAnnonce(`Une page compte au plus ${LIGNES_MAX} lignes : vérifiez celle-ci d’abord.`)
      return
    }
    setAnnonce(`Ligne ${apresIndex + 2} ajoutée.`)
    focusAttendu.current = { id, col: 0 }
  }

  function surTouche(e) {
    const champ = e.target
    if (champ.tagName !== 'INPUT' || !champ.dataset.id) return
    if (e.altKey || e.ctrlKey || e.metaKey || e.nativeEvent.isComposing) return
    const index = lignes.findIndex((l) => String(l.id) === champ.dataset.id)
    const col = Number(champ.dataset.col)

    if (e.key === 'Enter') {
      e.preventDefault()
      if (index < lignes.length - 1) focaliser({ id: lignes[index + 1].id, col: 0 })
      else ajouter(index)
    } else if (e.key === 'ArrowDown' && index < lignes.length - 1) {
      e.preventDefault()
      focaliser({ id: lignes[index + 1].id, col })
    } else if (e.key === 'ArrowUp' && index > 0) {
      e.preventDefault()
      focaliser({ id: lignes[index - 1].id, col })
    }
  }

  function supprimer(id) {
    const index = lignes.findIndex((l) => l.id === id)
    onSupprimer(id)
    setAnnonce(`Ligne ${index + 1} supprimée.`)
    // Le focus reste dans la grille : même rang, ou la ligne d'avant pour la dernière.
    const voisine = lignes[index + 1] ?? lignes[index - 1]
    if (voisine) focusAttendu.current = { id: voisine.id, col: 0 }
  }

  return (
    <div className="grille-registre">
      <p id="grille-registre-consigne" className="grille-registre__consigne">
        Une ligne par patient. <kbd className="grille-registre__touche">Tab</kbd> passe à la case
        suivante, <kbd className="grille-registre__touche">Entrée</kbd> à la ligne suivante.
      </p>
      <div className="grille-registre__defilement">
        <table
          ref={grille}
          className="grille-registre__table"
          aria-describedby="grille-registre-consigne"
          onKeyDown={surTouche}
        >
          <caption className="grille-registre__legende">Page recopiée</caption>
          <thead className="grille-registre__entete">
            <tr>
              <th scope="col" className="grille-registre__col-numero">
                N°
              </th>
              {COLONNES_REGISTRE.map((c) => (
                <th key={c.cle} scope="col">
                  {c.titre}
                  {c.aide && <span className="grille-registre__aide">{c.aide}</span>}
                </th>
              ))}
              <th scope="col">
                <span className="grille-registre__masque">Supprimer</span>
              </th>
            </tr>
          </thead>
          <tbody className="grille-registre__corps">
            {lignes.map((l, index) => (
              <LigneRegistre
                key={l.id}
                ligne={l}
                numero={index + 1}
                erreurs={erreursLignes[l.id]}
                onModifier={onModifier}
                onSupprimer={supprimer}
              />
            ))}
          </tbody>
        </table>
      </div>
      <div className="grille-registre__pied">
        <Button
          variante="secondaire"
          iconeDebut={<Icone icone={Plus} />}
          disabled={pleine}
          onClick={() => ajouter(lignes.length - 1)}
        >
          Ajouter une ligne
        </Button>
        <p className="grille-registre__compte">
          {lignes.length} / {LIGNES_MAX} lignes
        </p>
      </div>
      <p className="grille-registre__annonce" role="status">
        {annonce}
      </p>
    </div>
  )
}
