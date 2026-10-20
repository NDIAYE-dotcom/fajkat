import { useState } from 'react'
import Button from '../../../../components/ui/Button/Button.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import { formatHeure } from '../../../../lib/format.js'
import {
  lireCopieLocale,
  supprimerCopieLocale,
  useCleLocale,
} from '../../hooks/useSauvegardeConsultation.js'
import { normaliser } from '../../utils.js'
import './CopieLocale.css'

// Saisie restée sur l'appareil sans avoir été envoyée (consultation reprise par un
// collègue entre-temps) : lisible par son auteur seul, à recopier ou à effacer.
export default function CopieLocale({ id }) {
  const { cle } = useCleLocale(id)
  const [copie, setCopie] = useState(() => lireCopieLocale(cle))
  if (!copie?.modifie) return null
  const c = normaliser(copie.contenu)
  const champs = [
    ['Motif', c.reason],
    ['Histoire de la maladie', c.history],
    ['Examen clinique', c.examination],
    ['Conduite à tenir', c.plan],
  ].filter(([, v]) => v?.trim())
  const ordonnance = c.prescription.items
    .map((l) => [l.product_name, l.dosage].filter((x) => x?.trim()).join(' '))
    .filter(Boolean)
  return (
    <Message ton="info" titre={`Votre saisie non envoyée (${formatHeure(copie.date)})`}>
      <p>
        Elle est restée sur cet appareil. Transmettez-la au besoin à votre collègue, puis
        effacez-la.
      </p>
      {champs.length > 0 && (
        <dl className="copie-locale__champs">
          {champs.map(([libelle, valeur]) => (
            <div key={libelle}>
              <dt>{libelle}</dt>
              <dd>{valeur}</dd>
            </div>
          ))}
        </dl>
      )}
      {c.diagnoses.length > 0 && (
        <p>{`Diagnostics : ${c.diagnoses.map((d) => d.label).join(', ')}`}</p>
      )}
      {ordonnance.length > 0 && <p>{`Ordonnance : ${ordonnance.join(', ')}`}</p>}
      <Button
        variante="secondaire"
        onClick={() => {
          supprimerCopieLocale(cle)
          setCopie(null)
        }}
      >
        Effacer de cet appareil
      </Button>
    </Message>
  )
}
