import { Link } from 'react-router-dom'
import './Button.css'

// Bouton unique de l’application : <Link> si « to » est fourni, <a> si « href », sinon <button>.
// Variantes : primaire (action principale), secondaire (bordée), discret (lien).
export default function Button({
  to,
  href,
  variante = 'primaire',
  taille = 'normale',
  iconeFin,
  className = '',
  children,
  ...props
}) {
  const classes = ['button', `button--${variante}`, `button--${taille}`, className]
    .filter(Boolean)
    .join(' ')

  const contenu = (
    <>
      <span className="button__texte">{children}</span>
      {iconeFin && (
        <span className="button__icone" aria-hidden="true">
          {iconeFin}
        </span>
      )}
    </>
  )

  // Ancre dans la page courante (#section) : un simple lien suffit.
  if (href) {
    return (
      <a href={href} className={classes} {...props}>
        {contenu}
      </a>
    )
  }

  if (to) {
    return (
      <Link to={to} className={classes} {...props}>
        {contenu}
      </Link>
    )
  }

  return (
    <button type="button" className={classes} {...props}>
      {contenu}
    </button>
  )
}
