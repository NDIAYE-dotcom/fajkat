import { Link } from 'react-router-dom'
import Spinner from '../Spinner/Spinner.jsx'
import './Button.css'

// Bouton unique de l’application : <Link> si « to » est fourni, <a> si « href », sinon <button>.
// Variantes : primaire (action principale), secondaire (bordée), discret (lien).
// iconeDebut : icône avant le texte (fixe) ; iconeFin : flèche après le texte (glisse au survol).
// chargement : le bouton reste à sa taille, affiche un indicateur et refuse un second clic.
export default function Button({
  to,
  href,
  variante = 'primaire',
  taille = 'normale',
  iconeDebut,
  iconeFin,
  chargement = false,
  disabled,
  className = '',
  children,
  ...props
}) {
  const classes = [
    'button',
    `button--${variante}`,
    `button--${taille}`,
    chargement && 'button--chargement',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  const contenu = (
    <>
      {chargement ? (
        <Spinner className="button__spinner" taille={18} />
      ) : (
        iconeDebut && (
          <span className="button__icone-debut" aria-hidden="true">
            {iconeDebut}
          </span>
        )
      )}
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
    <button
      type="button"
      className={classes}
      disabled={disabled}
      aria-disabled={chargement || undefined}
      aria-busy={chargement || undefined}
      {...props}
      // preventDefault : bloque aussi l'envoi du formulaire pour un bouton « submit »
      onClick={chargement ? (evenement) => evenement.preventDefault() : props.onClick}
    >
      {contenu}
    </button>
  )
}
