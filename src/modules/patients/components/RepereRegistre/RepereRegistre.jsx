import Field from '../../../../components/ui/Field/Field.jsx'
import Input from '../../../../components/ui/Input/Input.jsx'
import './RepereRegistre.css'

// Repère facultatif « Registre de l'année ___, page ___ », gardé dans le journal :
// on sait d'où vient chaque dossier recopié.
export default function RepereRegistre({ annee, page, erreurs, onChange }) {
  return (
    <fieldset className="repere-registre">
      <legend className="repere-registre__titre">
        Repère du registre <span className="repere-registre__facultatif">(facultatif)</span>
      </legend>
      <p className="repere-registre__aide">
        Noté dans le journal, pour retrouver d’où viennent les dossiers.
      </p>
      <div className="repere-registre__champs">
        <Field
          label="Registre de l’année"
          erreur={erreurs.annee}
          className="repere-registre__annee"
        >
          <Input
            mono
            inputMode="numeric"
            autoComplete="off"
            maxLength={4}
            placeholder="2019"
            value={annee}
            onChange={(e) => onChange('annee', e.target.value)}
          />
        </Field>
        <Field label="Page" erreur={erreurs.page} className="repere-registre__page">
          <Input
            mono
            inputMode="numeric"
            autoComplete="off"
            maxLength={5}
            placeholder="34"
            value={page}
            onChange={(e) => onChange('page', e.target.value)}
          />
        </Field>
      </div>
    </fieldset>
  )
}
