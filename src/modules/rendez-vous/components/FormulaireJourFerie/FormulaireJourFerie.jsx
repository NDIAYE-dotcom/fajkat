import { useState } from 'react'
import DateInput from '../../../../components/ui/DateInput/DateInput.jsx'
import Field from '../../../../components/ui/Field/Field.jsx'
import Input from '../../../../components/ui/Input/Input.jsx'
import { versDateInput } from '../../utils.js'
import GrilleFormulaire from '../GrilleFormulaire/GrilleFormulaire.jsx'

// Jour férié : date et libellé. modele : fête de la liste du pays à dater (Korité…).
export default function FormulaireJourFerie({ ferie, modele, envoi, onEnregistrer, onAnnuler }) {
  const [date, setDate] = useState(() => versDateInput(ferie?.holiday_date))
  const [label, setLabel] = useState(ferie?.label ?? modele?.label ?? '')
  const [erreurs, setErreurs] = useState({})

  function envoyer(evenement) {
    evenement.preventDefault()
    const e = {}
    if (!date.date) {
      e.date = date.texte
        ? 'Cette date n’existe pas : vérifiez le jour et le mois.'
        : 'Tapez la date (JJ/MM/AAAA).'
    }
    if (label.trim().length < 2) e.label = 'Donnez un nom (exemple : Korité).'
    setErreurs(e)
    if (Object.keys(e).length) return
    onEnregistrer({
      holiday_date: date.date,
      label: label.trim(),
      ...(ferie ? {} : { template_code: modele?.code ?? null }),
    })
  }

  return (
    <GrilleFormulaire
      onSubmit={envoyer}
      onAnnuler={onAnnuler}
      envoi={envoi}
      libelleEnvoi={ferie ? 'Enregistrer' : 'Ajouter le jour férié'}
    >
      <Field label="Date" erreur={erreurs.date} requis>
        <DateInput value={date} onChange={setDate} />
      </Field>
      <Field label="Nom" erreur={erreurs.label} requis>
        <Input value={label} maxLength={80} onChange={(e) => setLabel(e.target.value)} />
      </Field>
    </GrilleFormulaire>
  )
}
