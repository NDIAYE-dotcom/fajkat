import { MessageCircle } from 'lucide-react'
import Button from '../../../../components/ui/Button/Button.jsx'
import { lienDemoWhatsApp } from '../../../../lib/offres.js'
import './BoutonDemo.css'

// « Demander une démo » : ouvre WhatsApp avec un message adapté à l'offre affichée.
// compact : libellé raccourci à « Démo » sur les petits écrans (le libellé complet reste lu).
export default function BoutonDemo({
  offre = null,
  variante = 'primaire',
  taille,
  compact = false,
  className = '',
}) {
  return (
    <Button
      href={lienDemoWhatsApp(offre)}
      target="_blank"
      rel="noopener noreferrer"
      variante={variante}
      taille={taille}
      className={`bouton-demo ${compact ? 'bouton-demo--compact' : ''} ${className}`.trim()}
    >
      <MessageCircle className="bouton-demo__icone" size={18} aria-hidden="true" />
      <span className="bouton-demo__long">Demander une démo</span>
      {compact && (
        <span className="bouton-demo__court" aria-hidden="true">
          Démo
        </span>
      )}
      <span className="sr-only"> sur WhatsApp (nouvel onglet)</span>
    </Button>
  )
}
