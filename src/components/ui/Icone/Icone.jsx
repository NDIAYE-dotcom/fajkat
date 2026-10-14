import './Icone.css'

// Seule porte d'entrée des icônes lucide-react dans l'application (règle ESLint) :
// taille 20 et trait 1,5 par défaut, pour un dessin fin et régulier, proche du trait de stylo.
// Accessibilité :
// - sans « label » : décorative (aria-hidden), un texte visible l'accompagne obligatoirement ;
// - avec « label » : l'icône porte seule une information (role="img" + aria-label).
// Pour un bouton sans texte visible, utiliser BoutonIcone (libellé obligatoire).
export default function Icone({
  icone: Composant,
  label,
  taille = 20,
  epaisseur = 1.5,
  className = '',
}) {
  const accessibilite = label
    ? { role: 'img', 'aria-label': label, 'aria-hidden': undefined }
    : { 'aria-hidden': true, focusable: 'false' }

  return (
    <Composant
      size={taille}
      strokeWidth={epaisseur}
      className={`icone ${className}`.trim()}
      {...accessibilite}
    />
  )
}
