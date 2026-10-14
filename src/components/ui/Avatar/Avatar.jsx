import './Avatar.css'

// Trois associations de tokens, toutes au-dessus de 4,5:1.
const TONS = ['menthe', 'doux', 'sombre']

// « Awa Diop » -> « AD » ; « Mamadou Lamine Ndiaye » -> « MN » (prénom + nom de famille).
function initiales(nom = '') {
  const mots = nom.trim().split(/\s+/).filter(Boolean)
  if (mots.length === 0) return '?'
  const premiere = mots[0][0]
  const derniere = mots.length > 1 ? mots[mots.length - 1][0] : ''
  return (premiere + derniere).toLocaleUpperCase('fr')
}

// Même nom -> même couleur, d'un écran à l'autre.
function tonDe(nom = '') {
  let somme = 0
  for (const caractere of nom) somme += caractere.codePointAt(0)
  return TONS[somme % TONS.length]
}

// Avatar à initiales (ou photo si « src »). decoratif : le nom est déjà écrit à côté.
export default function Avatar({ nom, src, taille = 'm', decoratif = false, className = '' }) {
  const classes = ['avatar', `avatar--${taille}`, `avatar--${tonDe(nom)}`, className]
    .filter(Boolean)
    .join(' ')
  const accessibilite = decoratif ? { 'aria-hidden': true } : { role: 'img', 'aria-label': nom }

  return (
    <span className={classes} {...accessibilite}>
      {src ? <img className="avatar__photo" src={src} alt="" /> : initiales(nom)}
    </span>
  )
}
