import { CircleAlert } from 'lucide-react'
import { useId } from 'react'
import { ChampContexte } from './useChamp.js'
import './Field.css'

// Enveloppe d'un champ : libellé, aide, message d'erreur, reliés au champ par le contexte.
// groupe : cases à cocher ou boutons radio -> <fieldset> + <legend> au lieu de <label>.
export default function Field({
  label,
  aide,
  erreur,
  requis = false,
  facultatif = false,
  groupe = false,
  id,
  className = '',
  children,
}) {
  const auto = useId()
  const idChamp = id ?? `champ-${auto}`
  const idAide = aide ? `${idChamp}-aide` : null
  const idErreur = erreur ? `${idChamp}-erreur` : null

  const contexte = {
    id: groupe ? undefined : idChamp,
    decritPar: [idErreur, idAide].filter(Boolean).join(' '),
    invalide: Boolean(erreur),
    requis: groupe ? undefined : requis,
  }

  const Conteneur = groupe ? 'fieldset' : 'div'
  const Libelle = groupe ? 'legend' : 'label'
  const classes = ['field', erreur && 'field--erreur', groupe && 'field--groupe', className]
    .filter(Boolean)
    .join(' ')

  return (
    <Conteneur
      className={classes}
      aria-describedby={groupe && contexte.decritPar ? contexte.decritPar : undefined}
    >
      <Libelle className="field__label" htmlFor={groupe ? undefined : idChamp}>
        {label}
        {requis && (
          <span className="field__requis">
            <span aria-hidden="true"> *</span>
            <span className="sr-only"> (obligatoire)</span>
          </span>
        )}
        {facultatif && <span className="field__facultatif"> (facultatif)</span>}
      </Libelle>

      {aide && (
        <p id={idAide} className="field__aide">
          {aide}
        </p>
      )}

      <ChampContexte.Provider value={contexte}>
        <div className="field__controle">{children}</div>
      </ChampContexte.Provider>

      {erreur && (
        <p id={idErreur} className="field__erreur">
          <CircleAlert className="field__erreur-icone" size={18} aria-hidden="true" />
          <span>{erreur}</span>
        </p>
      )}
    </Conteneur>
  )
}
