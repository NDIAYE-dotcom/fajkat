import { useState } from 'react'
import Field from '../../../../components/ui/Field/Field.jsx'
import Input from '../../../../components/ui/Input/Input.jsx'
import PhoneInput from '../../../../components/ui/PhoneInput/PhoneInput.jsx'
import Select from '../../../../components/ui/Select/Select.jsx'
import { estTelephoneValide } from '../../../../lib/pays.js'
import GrilleFormulaire from '../../../rendez-vous/components/GrilleFormulaire/GrilleFormulaire.jsx'
import { TYPES_ETABLISSEMENT } from '../../documents.js'

// Établissement de référence : nom, type, téléphone, adresse (imprimés sur la lettre).
export default function FormulaireDestination({ destination, envoi, onEnregistrer, onAnnuler }) {
  const [s, setS] = useState(() => ({
    name: destination?.name ?? '',
    kind: destination?.kind ?? 'centre_sante',
    phone: destination?.phone ?? '',
    address: destination?.address ?? '',
  }))
  const [erreurs, setErreurs] = useState({})
  const maj = (champ) => (e) => setS((p) => ({ ...p, [champ]: e.target.value }))

  function envoyer(evenement) {
    evenement.preventDefault()
    const e = {}
    if (s.name.trim().length < 2) e.name = 'Donnez le nom (exemple : Hôpital régional de Kolda).'
    if (s.phone && !estTelephoneValide(s.phone))
      e.phone = 'Numéro incomplet : vérifiez les chiffres.'
    setErreurs(e)
    if (Object.keys(e).length) return
    onEnregistrer({ ...s, name: s.name.trim(), address: s.address.trim() })
  }

  return (
    <GrilleFormulaire
      onSubmit={envoyer}
      onAnnuler={onAnnuler}
      envoi={envoi}
      libelleEnvoi={destination ? 'Enregistrer' : 'Ajouter l’établissement'}
    >
      <Field label="Nom" erreur={erreurs.name} requis>
        <Input value={s.name} maxLength={120} onChange={maj('name')} />
      </Field>
      <Field label="Type">
        <Select value={s.kind} options={TYPES_ETABLISSEMENT} onChange={maj('kind')} />
      </Field>
      <Field label="Téléphone" erreur={erreurs.phone} facultatif>
        <PhoneInput value={s.phone} onChange={(v) => setS((p) => ({ ...p, phone: v }))} />
      </Field>
      <Field label="Adresse" facultatif>
        <Input value={s.address} maxLength={200} onChange={maj('address')} />
      </Field>
    </GrilleFormulaire>
  )
}
