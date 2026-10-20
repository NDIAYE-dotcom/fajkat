import { ChevronDown } from 'lucide-react'
import { useId, useState } from 'react'
import Icone from '../../../../components/ui/Icone/Icone.jsx'
import './SectionConsultation.css'

// Section repliable de l'écran de consultation. Repliée, elle garde un résumé d'une ligne
// (« 2 diagnostics », « Motif : fièvre ») : rien de ce qui est saisi ne disparaît.
export default function SectionConsultation({ titre, resume, ouverte = true, alerte, children }) {
  const [ouvert, setOuvert] = useState(ouverte)
  const id = useId()
  return (
    <section className={`section-consultation${alerte ? ' section-consultation--alerte' : ''}`}>
      <h2 className="section-consultation__titre">
        <button
          type="button"
          className="section-consultation__bouton"
          aria-expanded={ouvert}
          aria-controls={id}
          onClick={() => setOuvert((o) => !o)}
        >
          <span className="section-consultation__libelle">{titre}</span>
          {!ouvert && resume && <span className="section-consultation__resume">{resume}</span>}
          <Icone icone={ChevronDown} className="section-consultation__chevron" />
        </button>
      </h2>
      <div id={id} className="section-consultation__corps" hidden={!ouvert}>
        {children}
      </div>
    </section>
  )
}
