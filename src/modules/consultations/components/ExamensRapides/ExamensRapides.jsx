import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import Button from '../../../../components/ui/Button/Button.jsx'
import Field from '../../../../components/ui/Field/Field.jsx'
import Icone from '../../../../components/ui/Icone/Icone.jsx'
import Input from '../../../../components/ui/Input/Input.jsx'
import Radio from '../../../../components/ui/Radio/Radio.jsx'
import Select from '../../../../components/ui/Select/Select.jsx'
import Tampon from '../../../../components/ui/Tampon/Tampon.jsx'
import { EXAMENS_MAX, lireNombre, RESULTATS } from '../../utils.js'
import './ExamensRapides.css'

// Examens rapides réalisés pendant la consultation (TDR paludisme, test de grossesse,
// glycémie…), d'après la liste de la structure. erreurs : { [index]: message }.
export default function ExamensRapides({ examens, valeur, onChange, erreurs = {}, desactive }) {
  const [choix, setChoix] = useState('')
  const actifs = examens.filter((e) => e.is_active)
  const typeDe = (id) => examens.find((e) => e.id === id)

  function maj(index, champs) {
    onChange(valeur.map((t, i) => (i === index ? { ...t, ...champs } : t)))
  }

  return (
    <div className="examens-rapides">
      {valeur.length > 0 && (
        <ul className="examens-rapides__liste">
          {valeur.map((t, i) => {
            const type = typeDe(t.rapid_test_type_id)
            const nombre = type?.result_kind === 'number' ? lireNombre(t.value) : null
            return (
              <li key={`${t.rapid_test_type_id}-${i}`} className="examens-rapides__ligne">
                <div className="examens-rapides__entete">
                  <span className="examens-rapides__nom">
                    {type?.label ?? 'Examen retiré de la liste'}
                  </span>
                  {type?.is_sensitive && <Tampon ton="encre">Sensible</Tampon>}
                  <span className="examens-rapides__retirer">
                    <Button
                      variante="discret"
                      iconeDebut={<Icone icone={Trash2} />}
                      disabled={desactive}
                      onClick={() => onChange(valeur.filter((_, j) => j !== i))}
                      aria-label={`Retirer l’examen ${type?.label ?? ''}`.trim()}
                    >
                      Retirer
                    </Button>
                  </span>
                </div>
                {type?.result_kind === 'binary' && (
                  <Field label="Résultat" groupe erreur={erreurs[i]}>
                    <div className="examens-rapides__resultats">
                      {RESULTATS.map((r) => (
                        <Radio
                          key={r.valeur}
                          name={`examen-${i}`}
                          label={r.libelle}
                          checked={t.result === r.valeur}
                          disabled={desactive}
                          onChange={() => maj(i, { result: r.valeur })}
                        />
                      ))}
                    </div>
                  </Field>
                )}
                {type?.result_kind === 'number' && (
                  <Field
                    label={`Résultat${type.unit ? ` (${type.unit})` : ''}`}
                    erreur={
                      erreurs[i] ??
                      (Number.isNaN(nombre) ? 'Tapez un nombre, par exemple 1,05.' : undefined)
                    }
                  >
                    <Input
                      inputMode="decimal"
                      value={t.value ?? ''}
                      disabled={desactive}
                      suffixe={type.unit}
                      onChange={(e) => maj(i, { value: e.target.value })}
                    />
                  </Field>
                )}
                {type?.result_kind === 'text' && (
                  <Field label="Résultat" erreur={erreurs[i]}>
                    <Input
                      value={t.value ?? ''}
                      maxLength={200}
                      disabled={desactive}
                      onChange={(e) => maj(i, { value: e.target.value })}
                    />
                  </Field>
                )}
                <Field label="Note" facultatif>
                  <Input
                    value={t.note ?? ''}
                    maxLength={300}
                    disabled={desactive}
                    onChange={(e) => maj(i, { note: e.target.value })}
                  />
                </Field>
              </li>
            )
          })}
        </ul>
      )}
      {valeur.length < EXAMENS_MAX && (
        <div className="examens-rapides__ajout">
          <div className="examens-rapides__choix">
            <Field label="Ajouter un examen rapide">
              <Select
                value={choix}
                disabled={desactive}
                placeholder="Choisir un examen"
                options={actifs.map((e) => ({ valeur: e.id, libelle: e.label }))}
                onChange={(e) => setChoix(e.target.value)}
              />
            </Field>
          </div>
          <Button
            variante="secondaire"
            iconeDebut={<Icone icone={Plus} />}
            disabled={desactive || !choix}
            onClick={() => {
              onChange([
                ...valeur,
                { rapid_test_type_id: choix, result: null, value: '', note: '' },
              ])
              setChoix('')
            }}
          >
            Ajouter
          </Button>
        </div>
      )}
    </div>
  )
}
