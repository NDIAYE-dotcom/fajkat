import './TamponAnime.css'

// Tampon (PAYÉ, VALIDÉ…) qui s'abat quand son fragment devient actif :
// échelle 1,4 -> 1, rotation -6°, 180 ms, après « delai » millisecondes.
export default function TamponAnime({ actif, delai = 600, className = '', children }) {
  return (
    <span
      className={`tampon-anime ${className}`.trim()}
      data-actif={actif || undefined}
      style={{ '--delai': `${delai}ms` }}
    >
      {children}
    </span>
  )
}
