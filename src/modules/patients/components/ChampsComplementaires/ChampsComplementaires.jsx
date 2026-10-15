import Field from '../../../../components/ui/Field/Field.jsx'
import Input from '../../../../components/ui/Input/Input.jsx'
import PhoneInput from '../../../../components/ui/PhoneInput/PhoneInput.jsx'
import Select from '../../../../components/ui/Select/Select.jsx'
import { ETATS_CIVILS, LANGUES } from '../../fiche.js'
import './ChampsComplementaires.css'

// Identité complémentaire, saisie dans la fiche (pas à la création rapide) : second
// téléphone, commune, profession, situation familiale, nom de la mère, personne à
// prévenir, langue préférée pour les messages.
export default function ChampsComplementaires({ id, saisie, erreurs, onChange }) {
  const texte = (champ, label, max, props = {}) => (
    <Field id={`${id}-${champ}`} label={label} facultatif>
      <Input
        autoComplete="off"
        maxLength={max}
        value={saisie[champ]}
        onChange={(e) => onChange(champ, e.target.value)}
        {...props}
      />
    </Field>
  )

  return (
    <>
      <div className="champs-complementaires__ligne">
        <Field
          id={`${id}-telephone2`}
          label="Second téléphone"
          facultatif
          erreur={erreurs.telephone2}
        >
          <PhoneInput value={saisie.telephone2} onChange={(v) => onChange('telephone2', v)} />
        </Field>
        {texte('commune', 'Commune', 120)}
      </div>
      <div className="champs-complementaires__ligne">
        {texte('profession', 'Profession', 120)}
        <Field id={`${id}-etatCivil`} label="Situation familiale" facultatif>
          <Select
            placeholder="Non précisée"
            options={ETATS_CIVILS}
            value={saisie.etatCivil}
            onChange={(e) => onChange('etatCivil', e.target.value)}
          />
        </Field>
      </div>
      <div className="champs-complementaires__ligne">
        {texte('nomMere', 'Nom de famille de la mère', 80, { autoCapitalize: 'words' })}
        <Field
          id={`${id}-langue`}
          label="Langue préférée"
          aide="Pour les rappels et les messages au patient."
        >
          <Select
            options={LANGUES}
            value={saisie.langue}
            onChange={(e) => onChange('langue', e.target.value)}
          />
        </Field>
      </div>
      <fieldset className="champs-complementaires__groupe">
        <legend className="champs-complementaires__legende">Personne à prévenir</legend>
        <div className="champs-complementaires__ligne">
          {texte('urgenceNom', 'Nom et prénom', 160, { autoCapitalize: 'words' })}
          {texte('urgenceLien', 'Lien avec le patient', 60, { placeholder: 'Mère, époux, frère…' })}
        </div>
        <Field id={`${id}-urgenceTel`} label="Téléphone" facultatif erreur={erreurs.urgenceTel}>
          <PhoneInput value={saisie.urgenceTel} onChange={(v) => onChange('urgenceTel', v)} />
        </Field>
      </fieldset>
    </>
  )
}
