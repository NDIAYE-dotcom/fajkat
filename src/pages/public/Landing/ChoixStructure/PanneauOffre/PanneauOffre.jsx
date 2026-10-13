import { ArrowRight } from 'lucide-react'
import { useId, useRef } from 'react'
import { useVisible } from '../../../../../hooks/useVisible.js'
import { mouvementReduit } from '../../../../../lib/mouvement.js'
import { prixOffre } from '../../../../../lib/offres.js'
import TamponFrappe from '../TamponFrappe/TamponFrappe.jsx'
import './PanneauOffre.css'

// Un des deux grands panneaux de l'écran de choix : le panneau entier est le bouton.
// Apercu : aperçu animé du produit, mis en pause hors de l'écran.
// etat : 'repos' | 'frappe' (ce panneau vient d'être tamponné) | 'estompe' (l'autre l'a été).
export default function PanneauOffre({ offre, apercu: Apercu, rappel, etat = 'repos', onChoisir }) {
  const ref = useRef(null)
  const visible = useVisible(ref)
  const idDescription = useId()
  const prix = prixOffre(offre)
  const libelle = [
    `Choisir l’offre ${offre.nom}, ${prix} par mois`,
    rappel && 'dernière offre consultée',
  ]
    .filter(Boolean)
    .join(', ')

  return (
    <button
      ref={ref}
      type="button"
      className={`panneau-offre panneau-offre--${etat}`}
      data-offre={offre.type}
      aria-label={libelle}
      aria-describedby={idDescription}
      aria-disabled={etat !== 'repos' || undefined}
      onClick={() => etat === 'repos' && onChoisir(offre.type)}
    >
      <span className="panneau-offre__tete">
        <span className="panneau-offre__reperage">
          {offre.choix.reperage}
          {rappel && <span className="panneau-offre__rappel"> · déjà consultée</span>}
        </span>
        <span className="panneau-offre__nom">{offre.nom}</span>
        <span className="panneau-offre__prix">
          <span className="panneau-offre__montant">{prix}</span> / mois
        </span>
      </span>

      <span className="panneau-offre__scene">
        <span className="panneau-offre__ecran">
          <Apercu actif={visible && etat !== 'estompe'} statique={mouvementReduit()} />
        </span>
        <span className="panneau-offre__mention">Aperçu · module prévu, données fictives</span>
      </span>

      <span className="panneau-offre__pied">
        <span id={idDescription} className="panneau-offre__description">
          {offre.choix.description}
        </span>
        <span className="panneau-offre__action" aria-hidden="true">
          Choisir cette offre
          <ArrowRight size={18} />
        </span>
      </span>

      {etat === 'frappe' && (
        <TamponFrappe className="panneau-offre__tampon">{offre.nom}</TamponFrappe>
      )}
    </button>
  )
}
