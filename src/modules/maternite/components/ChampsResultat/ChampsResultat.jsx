import DateInput from '../../../../components/ui/DateInput/DateInput.jsx'
import Field from '../../../../components/ui/Field/Field.jsx'
import Input from '../../../../components/ui/Input/Input.jsx'
import Radio from '../../../../components/ui/Radio/Radio.jsx'
import Select from '../../../../components/ui/Select/Select.jsx'
import { lireDateFr } from '../../../../lib/format.js'
import { lireNombre, RESULTATS } from '../../../consultations/utils.js'
import './ChampsResultat.css'

// Cases d'un résultat d'un laboratoire extérieur : examen, date, laboratoire, résultat selon
// le type (positif / négatif / invalide, valeur avec unité, texte).
//   valeur : { rapid_test_type_id, taken_on, taken_on_texte, lab_name, result, value_number,
//              value_text } ; onChange(champs modifiés) ; erreurs : { [case]: message }.
export default function ChampsResultat({
  prefixe,
  examens,
  valeur: t,
  erreurs = {},
  desactive,
  onChange,
}) {
  const type = examens.find((e) => e.id === t.rapid_test_type_id)
  const nombre = type?.result_kind === 'number' ? lireNombre(t.value_number) : null
  return (
    <div className="champs-resultat">
      <Field id={`${prefixe}-examen`} label="Examen" requis erreur={erreurs.examen}>
        <Select
          value={t.rapid_test_type_id ?? ''}
          disabled={desactive}
          options={[
            { valeur: '', libelle: 'Choisir' },
            ...examens.map((e) => ({ valeur: e.id, libelle: e.label })),
          ]}
          onChange={(e) =>
            onChange({
              rapid_test_type_id: e.target.value,
              result: null,
              value_number: '',
              value_text: '',
            })
          }
        />
      </Field>
      <Field id={`${prefixe}-date`} label="Date de l’examen" requis erreur={erreurs.date}>
        <DateInput
          value={{ type: 'date', date: t.taken_on ?? null, texte: t.taken_on_texte ?? '' }}
          disabled={desactive}
          onChange={(d) => onChange({ taken_on: lireDateFr(d.texte), taken_on_texte: d.texte })}
        />
      </Field>
      <Field
        id={`${prefixe}-labo`}
        label="Laboratoire"
        requis
        erreur={erreurs.labo}
        aide="Exemple : Laboratoire Bio 24, Dakar."
      >
        <Input
          maxLength={120}
          value={t.lab_name ?? ''}
          disabled={desactive}
          onChange={(e) => onChange({ lab_name: e.target.value })}
        />
      </Field>
      {type?.result_kind === 'binary' && (
        <Field groupe label="Résultat" erreur={erreurs.resultat} className="champs-resultat__large">
          <div className="champs-resultat__radios">
            {RESULTATS.map((r) => (
              <Radio
                key={r.valeur}
                name={`${prefixe}-resultat`}
                label={r.libelle}
                checked={t.result === r.valeur}
                disabled={desactive}
                onChange={() => onChange({ result: r.valeur })}
              />
            ))}
          </div>
        </Field>
      )}
      {type?.result_kind === 'number' && (
        <Field
          id={`${prefixe}-valeur`}
          label={`Résultat${type.unit ? ` (${type.unit})` : ''}`}
          requis
          erreur={
            erreurs.resultat ??
            (Number.isNaN(nombre) ? 'Tapez un nombre, par exemple 10,5.' : undefined)
          }
        >
          <Input
            mono
            inputMode="decimal"
            maxLength={10}
            suffixe={type.unit}
            value={t.value_number ?? ''}
            disabled={desactive}
            onChange={(e) => onChange({ value_number: e.target.value })}
          />
        </Field>
      )}
      {type?.result_kind === 'text' && (
        <Field
          id={`${prefixe}-texte`}
          label="Résultat"
          requis
          erreur={erreurs.resultat}
          className="champs-resultat__large"
        >
          <Input
            maxLength={200}
            value={t.value_text ?? ''}
            disabled={desactive}
            onChange={(e) => onChange({ value_text: e.target.value })}
          />
        </Field>
      )}
    </div>
  )
}
