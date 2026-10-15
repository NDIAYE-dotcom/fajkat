import { Trash2 } from 'lucide-react'
import BoutonIcone from '../../../../components/ui/BoutonIcone/BoutonIcone.jsx'
import { useSuggestionsQuartier } from '../../hooks/useSuggestionsQuartier.js'
import { COLONNES_REGISTRE } from '../../import/registre.js'
import SuggestionsQuartier from '../SuggestionsQuartier/SuggestionsQuartier.jsx'
import './LigneRegistre.css'

// Une ligne de la page recopiée = un patient. Chaque case a son libellé (visible sous
// 640 px, où la ligne devient une fiche ; lu par les lecteurs d'écran au-delà).
// Les cases portent data-id et data-col : la grille s'en sert pour la navigation au clavier.
// Quartier : quartiers déjà saisis proposés ; flèches et Entrée servent la liste quand
// elle est affichée, la grille sinon.
export default function LigneRegistre({ ligne, numero, erreurs, onModifier, onSupprimer }) {
  const idErreurs = erreurs ? `ligne-registre-${ligne.id}-erreurs` : undefined
  const quartier = useSuggestionsQuartier(ligne.quartier, (v) =>
    onModifier(ligne.id, 'quartier', v),
  )

  return (
    <>
      <tr className={`ligne-registre${erreurs ? ' ligne-registre--erreur' : ''}`}>
        <th scope="row" className="ligne-registre__numero">
          <span className="ligne-registre__mot">Ligne </span>
          {numero}
        </th>
        {COLONNES_REGISTRE.map((c, col) => (
          <td key={c.cle} className={`ligne-registre__case ligne-registre__case--${c.cle}`}>
            <label className="ligne-registre__etiquette">
              <span className="ligne-registre__libelle">
                {c.titre}
                {c.aide && <span className="ligne-registre__aide"> ({c.aide})</span>}
                <span className="ligne-registre__rang">, ligne {numero}</span>
              </span>
              <input
                className={`ligne-registre__champ${c.mono ? ' ligne-registre__champ--mono' : ''}`}
                type="text"
                value={ligne[c.cle]}
                onChange={(e) => onModifier(ligne.id, c.cle, e.target.value)}
                data-id={ligne.id}
                data-col={col}
                inputMode={c.mode}
                autoCapitalize={c.autoCapitalize ?? 'off'}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                aria-invalid={erreurs ? true : undefined}
                aria-describedby={idErreurs}
                {...(c.cle === 'quartier' ? quartier.champ : {})}
              />
            </label>
            {c.cle === 'quartier' && <SuggestionsQuartier {...quartier.liste} />}
          </td>
        ))}
        <td className="ligne-registre__action">
          <BoutonIcone
            icone={Trash2}
            label={`Supprimer la ligne ${numero}`}
            onClick={() => onSupprimer(ligne.id)}
          />
        </td>
      </tr>
      {erreurs && (
        <tr className="ligne-registre__erreurs">
          <td colSpan={COLONNES_REGISTRE.length + 2} id={idErreurs}>
            <span className="ligne-registre__mot-erreur">Ligne {numero} à corriger :</span>
            <ul className="ligne-registre__liste">
              {erreurs.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </td>
        </tr>
      )}
    </>
  )
}
