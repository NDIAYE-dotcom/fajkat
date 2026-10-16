import { useState } from 'react'
import Field from '../../../../components/ui/Field/Field.jsx'
import Input from '../../../../components/ui/Input/Input.jsx'
import Select from '../../../../components/ui/Select/Select.jsx'
import { heureCourte, JOURS_SEMAINE } from '../../utils.js'
import GrilleFormulaire from '../GrilleFormulaire/GrilleFormulaire.jsx'

const HEURE = /^([01]\d|2[0-3]):[0-5]\d$/

// Pause : tous les jours ou un seul jour (la prière du vendredi, par exemple).
export default function FormulairePause({ pause, envoi, onEnregistrer, onAnnuler }) {
  const [s, setS] = useState(() => ({
    jour: pause?.weekday != null ? String(pause.weekday) : '',
    debut: heureCourte(pause?.start_time) || '13:00',
    fin: heureCourte(pause?.end_time) || '15:00',
    label: pause?.label ?? 'Pause',
  }))
  const [erreurs, setErreurs] = useState({})
  const maj = (champ) => (e) => setS((p) => ({ ...p, [champ]: e.target.value }))

  function envoyer(evenement) {
    evenement.preventDefault()
    const e = {}
    if (s.label.trim().length < 2) e.label = 'Donnez un nom (exemple : Déjeuner).'
    if (!HEURE.test(s.debut)) e.debut = 'Tapez une heure, par exemple 13:00.'
    if (!HEURE.test(s.fin)) e.fin = 'Tapez une heure, par exemple 15:00.'
    else if (HEURE.test(s.debut) && s.fin <= s.debut) e.fin = 'La fin doit suivre le début.'
    setErreurs(e)
    if (Object.keys(e).length) return
    onEnregistrer({
      weekday: s.jour ? Number(s.jour) : null,
      start_time: s.debut,
      end_time: s.fin,
      label: s.label.trim(),
    })
  }

  return (
    <GrilleFormulaire
      onSubmit={envoyer}
      onAnnuler={onAnnuler}
      envoi={envoi}
      libelleEnvoi={pause ? 'Enregistrer' : 'Ajouter la pause'}
    >
      <Field label="Nom" erreur={erreurs.label} requis>
        <Input value={s.label} maxLength={60} onChange={maj('label')} />
      </Field>
      <Field label="Jour">
        <Select
          value={s.jour}
          onChange={maj('jour')}
          options={[
            { valeur: '', libelle: 'Tous les jours' },
            ...JOURS_SEMAINE.map((j) => ({ valeur: String(j.valeur), libelle: j.libelle })),
          ]}
        />
      </Field>
      <Field label="Début" erreur={erreurs.debut} requis>
        <Input type="time" value={s.debut} onChange={maj('debut')} />
      </Field>
      <Field label="Fin" erreur={erreurs.fin} requis>
        <Input type="time" value={s.fin} onChange={maj('fin')} />
      </Field>
    </GrilleFormulaire>
  )
}
