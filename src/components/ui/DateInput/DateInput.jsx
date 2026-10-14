import { useId } from 'react'
import { useCurseurChiffres } from '../../../hooks/useCurseurChiffres.js'
import { ageDepuisNaissance, lireDateFr, masquerDate } from '../../../lib/format.js'
import Checkbox from '../Checkbox/Checkbox.jsx'
import Input from '../Input/Input.jsx'
import Select from '../Select/Select.jsx'
import './DateInput.css'

const UNITES_AGE = [
  { valeur: 'ans', libelle: 'ans' },
  { valeur: 'mois', libelle: 'mois' },
]

// Date au format JJ/MM/AAAA. Avec ageDeclare, une case permet de saisir un âge déclaré :
// beaucoup de patients ne connaissent pas leur date de naissance exacte.
// Valeur :
//   { type: 'date', date: '1990-05-12' | null, texte: '12/05/1990' }  (date null si incomplète)
//   { type: 'age', age: 34 | null, unite: 'ans' | 'mois' }
export default function DateInput({
  value,
  onChange,
  ageDeclare = false,
  afficherAge = ageDeclare,
  id,
  ref,
  ...props
}) {
  const { ref: refChamp, memoriser } = useCurseurChiffres(ref)
  const enAge = value?.type === 'age'
  const idBase = `date-${useId()}`

  function surSaisieDate(evenement) {
    memoriser(evenement)
    const texte = masquerDate(evenement.target.value)
    onChange?.({ type: 'date', date: lireDateFr(texte), texte })
  }

  function surSaisieAge(evenement) {
    const chiffres = evenement.target.value.replace(/\D/g, '').slice(0, 3)
    onChange?.({ ...value, age: chiffres === '' ? null : Number(chiffres) })
  }

  function basculer(evenement) {
    onChange?.(
      evenement.target.checked
        ? { type: 'age', age: null, unite: 'ans' }
        : { type: 'date', date: null, texte: '' },
    )
  }

  const texte =
    value?.texte ?? (value?.date ? masquerDate(value.date.split('-').reverse().join('')) : '')
  const age = afficherAge && value?.date ? ageDepuisNaissance(value.date) : ''

  return (
    <div className="date-input">
      {enAge ? (
        <div className="date-input__age">
          <Input
            {...props}
            id={id}
            ref={refChamp}
            inputMode="numeric"
            autoComplete="off"
            mono
            className="date-input__nombre"
            placeholder="Âge"
            value={value.age ?? ''}
            onChange={surSaisieAge}
          />
          <Select
            id={`${idBase}-unite`}
            invalide={false}
            required={false}
            aria-label="Unité de l'âge"
            disabled={props.disabled}
            options={UNITES_AGE}
            value={value.unite}
            onChange={(e) => onChange?.({ ...value, unite: e.target.value })}
          />
        </div>
      ) : (
        <Input
          {...props}
          id={id}
          ref={refChamp}
          inputMode="numeric"
          autoComplete="off"
          mono
          placeholder="JJ/MM/AAAA"
          value={texte}
          onChange={surSaisieDate}
          suffixe={age ? <span className="date-input__age-calcule">{age}</span> : null}
        />
      )}

      {ageDeclare && (
        <Checkbox
          id={`${idBase}-age-declare`}
          invalide={false}
          required={false}
          label="Date exacte inconnue : saisir l'âge déclaré"
          checked={enAge}
          disabled={props.disabled}
          onChange={basculer}
        />
      )}
    </div>
  )
}
