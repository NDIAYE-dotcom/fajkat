import { X } from 'lucide-react'
import { useId } from 'react'
import { useDialogue } from '../../../hooks/useDialogue.js'
import Button from '../Button/Button.jsx'
import './Modal.css'

// Fenêtre modale : confirmation, saisie courte. Focus piégé, Échap pour fermer,
// retour du focus sur le bouton d'ouverture (voir useDialogue).
// actions : boutons du pied (le bouton principal en dernier, à droite).
export default function Modal({
  ouvert,
  onFermer,
  titre,
  description,
  actions,
  taille = 'normale',
  fermerSurVoile = true,
  className = '',
  children,
}) {
  const idTitre = useId()
  const idDescription = useId()
  const { ref, onClick, onKeyDown } = useDialogue({ ouvert, onFermer, fermerSurVoile })

  return (
    <dialog
      ref={ref}
      className={`modal modal--${taille} ${className}`.trim()}
      aria-labelledby={idTitre}
      aria-describedby={description ? idDescription : undefined}
      onClick={onClick}
      onKeyDown={onKeyDown}
    >
      <div className="modal__boite">
        <header className="modal__entete">
          <div>
            <h2 id={idTitre} className="modal__titre">
              {titre}
            </h2>
            {description && (
              <p id={idDescription} className="modal__description">
                {description}
              </p>
            )}
          </div>
          <Button
            variante="secondaire"
            className="modal__fermer"
            iconeDebut={<X />}
            onClick={onFermer}
          >
            Fermer
          </Button>
        </header>
        <div className="modal__corps">{children}</div>
        {actions && <footer className="modal__actions">{actions}</footer>}
      </div>
    </dialog>
  )
}
