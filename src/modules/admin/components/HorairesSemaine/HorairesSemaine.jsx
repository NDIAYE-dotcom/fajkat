import Button from '../../../../components/ui/Button/Button.jsx'
import Field from '../../../../components/ui/Field/Field.jsx'
import Input from '../../../../components/ui/Input/Input.jsx'
import Select from '../../../../components/ui/Select/Select.jsx'
import { JOURS } from '../../utils.js'
import './HorairesSemaine.css'

const STATUTS = [
  { valeur: 'ferme', libelle: 'Fermé' },
  { valeur: 'ouvert', libelle: 'Ouvert' },
  { valeur: 'continu', libelle: 'Ouvert 24 h / 24' },
]

// Horaires d'ouverture, jour par jour. value : { lundi: { statut, debut, fin }, … }.
// erreurs : { lundi: 'message' }.
export default function HorairesSemaine({ value, erreurs = {}, onChange }) {
  function maj(jour, champ, valeur) {
    onChange({ ...value, [jour]: { ...value[jour], [champ]: valeur } })
  }

  // Les horaires du lundi recopiés sur les autres jours ouverts (cas le plus courant).
  function recopierLundi() {
    const lundi = value.lundi
    onChange(
      Object.fromEntries(
        JOURS.map(({ code }) => [
          code,
          code === 'lundi' || value[code].statut === 'ferme' ? value[code] : { ...lundi },
        ]),
      ),
    )
  }

  const lundiRenseigne =
    value.lundi.statut === 'continu' ||
    (value.lundi.statut === 'ouvert' && value.lundi.debut && value.lundi.fin)

  return (
    <Field
      label="Horaires d’ouverture"
      groupe
      facultatif
      aide="Pour les rappels envoyés aux patients et l’affichage à l’entrée."
    >
      <ul className="horaires-semaine">
        {JOURS.map(({ code, libelle }) => {
          const jour = value[code]
          return (
            <li key={code} className="horaires-semaine__jour">
              <Field id={`horaires-${code}`} label={libelle} erreur={erreurs[code]}>
                <Select
                  options={STATUTS}
                  value={jour.statut}
                  onChange={(e) => maj(code, 'statut', e.target.value)}
                />
              </Field>
              {jour.statut === 'ouvert' && (
                <div className="horaires-semaine__heures">
                  <Field id={`horaires-${code}-debut`} label="De">
                    <Input
                      type="time"
                      value={jour.debut}
                      onChange={(e) => maj(code, 'debut', e.target.value)}
                    />
                  </Field>
                  <Field id={`horaires-${code}-fin`} label="À">
                    <Input
                      type="time"
                      value={jour.fin}
                      onChange={(e) => maj(code, 'fin', e.target.value)}
                    />
                  </Field>
                </div>
              )}
            </li>
          )
        })}
      </ul>
      {lundiRenseigne && (
        <Button variante="discret" onClick={recopierLundi}>
          Appliquer les horaires du lundi aux autres jours ouverts
        </Button>
      )}
    </Field>
  )
}
