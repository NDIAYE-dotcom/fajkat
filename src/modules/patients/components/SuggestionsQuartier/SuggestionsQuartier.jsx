import './SuggestionsQuartier.css'

// Liste des quartiers proposés (role="listbox"), pilotée par useSuggestionsQuartier.
// Le focus reste dans le champ : flèches + Entrée, ou au doigt.
export default function SuggestionsQuartier({
  id,
  visible,
  options,
  actif,
  idOption,
  position,
  onChoisir,
  onSurvol,
}) {
  return (
    <ul
      id={id}
      role="listbox"
      aria-label="Quartiers déjà saisis"
      className="suggestions-quartier"
      hidden={!visible || !position}
      style={position ?? undefined}
    >
      {options.map((o, i) => (
        <li
          key={o.neighborhood}
          id={idOption(i)}
          role="option"
          aria-selected={i === actif}
          className={`suggestions-quartier__option${i === actif ? ' suggestions-quartier__option--active' : ''}`}
          // mousedown : le champ garde le focus, la liste ne se ferme pas avant le clic.
          onMouseDown={(e) => e.preventDefault()}
          onMouseEnter={() => onSurvol(i)}
          onClick={() => onChoisir(o)}
        >
          <span className="suggestions-quartier__nom">{o.neighborhood}</span>
          <span className="suggestions-quartier__compte">
            {o.patient_count} patient{o.patient_count > 1 ? 's' : ''}
          </span>
        </li>
      ))}
    </ul>
  )
}
