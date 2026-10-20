import { useState } from 'react'
import Antecedents from '../Antecedents/Antecedents.jsx'
import SectionConsultation from '../SectionConsultation/SectionConsultation.jsx'

const GRAND_ECRAN = '(min-width: 75rem)'

// Antécédents à portée de main pendant la consultation : ouverts à côté de la saisie sur
// grand écran, repliés au-dessus sur téléphone. Ajout rapide sans quitter la consultation.
export default function PanneauAntecedents({ patientId, consultation, droits, sensible }) {
  const [ouverte] = useState(() => globalThis.matchMedia?.(GRAND_ECRAN).matches ?? true)
  return (
    <SectionConsultation
      titre="Antécédents"
      resume="Médicaux, chirurgicaux, familiaux…"
      ouverte={ouverte}
    >
      <Antecedents
        patientId={patientId}
        ecrire={droits.ecrire}
        habilite={droits.sensible}
        consultationId={consultation.id}
        sensibleParDefaut={sensible}
      />
    </SectionConsultation>
  )
}
