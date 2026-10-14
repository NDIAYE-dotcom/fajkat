import { X } from 'lucide-react'
import { useId } from 'react'
import { useDialogue } from '../../../hooks/useDialogue.js'
import Button from '../Button/Button.jsx'
import './Drawer.css'

// Tiroir latéral : détail d'un patient depuis une liste, filtres, panier de la caisse.
// Même comportement que Modal (focus piégé, Échap, retour du focus) ; pleine largeur sur téléphone.
export default function Drawer({
  ouvert,
  onFermer,
  titre,
  actions,
  cote = 'droite',
  className = '',
  children,
}) {
  const idTitre = useId()
  const { ref, onClick, onKeyDown } = useDialogue({ ouvert, onFermer })

  return (
    <dialog
      ref={ref}
      className={`drawer drawer--${cote} ${className}`.trim()}
      aria-labelledby={idTitre}
      onClick={onClick}
      onKeyDown={onKeyDown}
    >
      <div className="drawer__boite">
        <header className="drawer__entete">
          <h2 id={idTitre} className="drawer__titre">
            {titre}
          </h2>
          <Button
            variante="secondaire"
            className="drawer__fermer"
            iconeDebut={<X />}
            onClick={onFermer}
          >
            Fermer
          </Button>
        </header>
        <div className="drawer__corps">{children}</div>
        {actions && <footer className="drawer__actions">{actions}</footer>}
      </div>
    </dialog>
  )
}
