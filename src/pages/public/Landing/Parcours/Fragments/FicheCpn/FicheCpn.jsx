import { Check, ClipboardList } from 'lucide-react'
import CarteFragment from '../../CarteFragment/CarteFragment.jsx'
import './FicheCpn.css'

const MESURES = [
  ['Tension artérielle', '11/7'],
  ['Poids', '64 kg'],
  ['Hauteur utérine', '22 cm'],
  ['Bruits du cœur fœtal', 'Présents'],
  ['Prochain rendez-vous', '13/11'],
]

// Fiche de consultation prénatale qui se remplit ligne après ligne.
export default function FicheCpn({ actif }) {
  return (
    <CarteFragment
      icone={ClipboardList}
      titre="Consultation prénatale"
      precision="CPN 3"
      actif={actif}
    >
      <p className="fiche-cpn__patiente">
        <strong>Awa D.</strong> · 27 ans · 24 semaines
      </p>
      <dl className="fiche-cpn__mesures">
        {MESURES.map(([libelle, valeur], index) => (
          <div key={libelle} className="fiche-cpn__ligne" style={{ '--i': index }}>
            <dt>{libelle}</dt>
            <dd className="fiche-cpn__valeur">{valeur}</dd>
          </div>
        ))}
      </dl>
      <p className="fiche-cpn__enregistre">
        <Check size={16} strokeWidth={2.5} />
        Enregistré dans le dossier
      </p>
    </CarteFragment>
  )
}
