import { ArrowRight } from 'lucide-react'
import Button from '../../../../components/ui/Button/Button.jsx'
import Tampon from '../../../../components/ui/Tampon/Tampon.jsx'
import { prixOffre } from '../../../../lib/offres.js'
import './PrixOffre.css'

// Fiche tarifaire. Disposition « fiche » (colonne) ou « bande » (pleine largeur).
export default function PrixOffre({ offre, notes = [], disposition = 'fiche' }) {
  return (
    <aside
      className={`prix-offre prix-offre--${disposition}`}
      aria-label={`Tarif de l’offre ${offre.nom}`}
    >
      <div className="prix-offre__tete">
        <p className="prix-offre__libelle">Abonnement {offre.nom}</p>
        <p className="prix-offre__montant">
          <span className="prix-offre__chiffre">{prixOffre(offre)}</span>
          <span className="prix-offre__periode">par mois</span>
        </p>
        <Tampon className="prix-offre__tampon">En développement</Tampon>
      </div>

      {notes.length > 0 && (
        <ul className="prix-offre__notes">
          {notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}

      <Button
        to={`/inscription?offre=${offre.type}`}
        taille="grande"
        className="prix-offre__action"
        iconeFin={<ArrowRight size={18} />}
      >
        Inscrire ma structure
      </Button>
    </aside>
  )
}
