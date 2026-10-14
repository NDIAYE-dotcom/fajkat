import './Skeleton.css'

// Emplacement gris pendant le chargement : la page garde sa forme, rien ne « saute ».
// Décoratif : le conteneur parent porte aria-busy="true" et, si besoin, un texte « Chargement… ».
// forme : ligne (texte), titre, bloc (image, carte), cercle (avatar).
export default function Skeleton({ forme = 'ligne', largeur, hauteur, className = '' }) {
  return (
    <span
      className={`skeleton skeleton--${forme} ${className}`.trim()}
      style={{ width: largeur, height: hauteur }}
      aria-hidden="true"
    />
  )
}
