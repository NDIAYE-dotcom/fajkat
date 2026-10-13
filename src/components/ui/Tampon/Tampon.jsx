import './Tampon.css'

// Badge façon tampon encreur : PAYÉ, URGENT, VACCINÉ, EN DÉVELOPPEMENT…
// Tons : alerte (rouge tampon), primaire (couleur de l'offre), neutre (encre).
export default function Tampon({ ton = 'alerte', className = '', children }) {
  return <span className={`tampon tampon--${ton} ${className}`.trim()}>{children}</span>
}
