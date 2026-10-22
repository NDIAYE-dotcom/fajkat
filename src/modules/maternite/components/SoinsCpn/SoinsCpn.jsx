import { ClipboardPlus } from 'lucide-react'
import Button from '../../../../components/ui/Button/Button.jsx'
import Checkbox from '../../../../components/ui/Checkbox/Checkbox.jsx'
import Field from '../../../../components/ui/Field/Field.jsx'
import Icone from '../../../../components/ui/Icone/Icone.jsx'
import Input from '../../../../components/ui/Input/Input.jsx'
import Tampon from '../../../../components/ui/Tampon/Tampon.jsx'
import { formatDate } from '../../../../lib/format.js'
import { useFormesMedicament } from '../../../consultations/hooks/useOrdonnance.js'
import { aujourdhuiStructure } from '../../grossesse.js'
import {
  ajouterSoinOrdonnance,
  dansOrdonnance,
  etatSoin,
  texteProchaineDose,
  texteProtection,
} from '../../soins.js'
import './SoinsCpn.css'

// Soins préventifs faits pendant la CPN (fer, SP, moustiquaire, déparasitage) et dose de Td.
// Les règles (terme minimal, intervalle, nombre) viennent de la base ; une situation cochée
// dans ce brouillon bloque aussitôt le soin qu'elle concerne (règle de la table des types).
// « Ajouter à l'ordonnance » : une seule ligne par soin, même après deux clics.
export default function SoinsCpn({
  soins,
  td,
  types,
  valeur: m,
  bloques,
  desactive,
  onChange,
  ordonnance,
  onOrdonnance,
}) {
  const formes = useFormesMedicament()
  const aujourdhui = aujourdhuiStructure()

  // Blocage d'après les situations du brouillon (sinon celui renvoyé par la base).
  function regle(s) {
    const type = types.find((t) => t.id === s.type_id)
    if (!type) return { bloque: Boolean(s.blocked), message: s.block_message }
    return {
      bloque: Boolean(type.blocked_by_condition) && bloques.includes(type.blocked_by_condition),
      message: type.block_message,
    }
  }
  function etat(s) {
    const r = regle(s)
    return etatSoin({ ...s, blocked: r.bloque, block_message: r.message }, aujourdhui)
  }

  const coche = (s) => m.interventions.some((i) => i.type_id === s.type_id)
  function basculer(s, oui) {
    onChange({
      ...m,
      interventions: oui
        ? [...m.interventions, { type_id: s.type_id }]
        : m.interventions.filter((i) => i.type_id !== s.type_id),
    })
  }

  const prochaineTd = td?.next
  const tdPossible =
    prochaineTd && (!prochaineTd.possible_from || prochaineTd.possible_from <= aujourdhui)

  return (
    <fieldset className="soins-cpn__bloc">
      <legend className="soins-cpn__titre">Soins préventifs</legend>
      <ul className="soins-cpn-liste">
        {soins.map((s) => {
          const e = etat(s)
          const fait = coche(s)
          const libelle = s.numbered ? `${s.label} — ${s.dose_label} ${s.next_number}` : s.label
          return (
            <li key={s.type_id} className="soins-cpn-liste__ligne">
              <Checkbox
                className="soins-cpn-liste__soin"
                label={libelle}
                description={
                  [
                    s.count > 0 && s.last_on ? `Dernier : ${formatDate(s.last_on)}.` : null,
                    s.count > 0 && !s.last_on ? 'Déjà reçu ailleurs.' : null,
                    !fait ? e.raison : null,
                  ]
                    .filter(Boolean)
                    .join(' ') || undefined
                }
                checked={fait}
                disabled={desactive || (!fait && !e.faisable)}
                onChange={(ev) => basculer(s, ev.target.checked)}
              />
              {fait && !e.faisable && (
                <p className="soins-cpn-liste__alerte" role="alert">
                  {e.raison} Décochez ce soin.
                </p>
              )}
              {s.prescription && regle(s).bloque && dansOrdonnance(ordonnance, s) && (
                <p className="soins-cpn-liste__alerte" role="alert">
                  La ligne est encore dans l’ordonnance : retirez-la (section Ordonnance).
                </p>
              )}
              {s.prescription && !regle(s).bloque && (
                <div className="soins-cpn-liste__ordonnance">
                  {dansOrdonnance(ordonnance, s) && fait ? (
                    <Tampon ton="primaire">Dans l’ordonnance</Tampon>
                  ) : dansOrdonnance(ordonnance, s) ? (
                    // Prescrire n'est pas donner (SP achetée à la pharmacie, pas encore
                    // prise) : le soin n'est jamais coché d'office.
                    <p className="soins-cpn-liste__doux">
                      Dans l’ordonnance — cochez le soin s’il est donné aujourd’hui.
                    </p>
                  ) : (
                    <Button
                      variante="secondaire"
                      iconeDebut={<Icone icone={ClipboardPlus} />}
                      disabled={desactive || !formes.data}
                      onClick={() =>
                        onOrdonnance(ajouterSoinOrdonnance(ordonnance, s, formes.data ?? []))
                      }
                    >
                      Ajouter à l’ordonnance
                    </Button>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>

      <div className="soins-cpn-td">
        <h3 className="soins-cpn-td__titre">Vaccin Td</h3>
        <p className="soins-cpn-td__etat">
          {[
            td?.doses?.length
              ? `${td.doses.length} dose${td.doses.length > 1 ? 's' : ''} notée${td.doses.length > 1 ? 's' : ''}.`
              : 'Aucune dose notée.',
            texteProtection(td?.protection),
            prochaineTd
              ? texteProchaineDose(prochaineTd, aujourdhui)
              : td?.doses?.length > 0 && 'Toutes les doses sont notées.',
          ]
            .filter(Boolean)
            .join(' ')}
        </p>
        {prochaineTd && (
          <Checkbox
            label={`${prochaineTd.label} faite pendant cette CPN`}
            description={
              tdPossible ? undefined : 'Pas encore possible : délai minimal non atteint.'
            }
            checked={Boolean(m.td?.given)}
            disabled={desactive || (!tdPossible && !m.td?.given)}
            onChange={(ev) =>
              onChange({ ...m, td: ev.target.checked ? { given: true, lot_number: '' } : null })
            }
          />
        )}
        {m.td?.given && (
          <Field id="soins-cpn-lot" label="Numéro de lot" facultatif>
            <Input
              mono
              maxLength={40}
              value={m.td.lot_number ?? ''}
              disabled={desactive}
              onChange={(ev) => onChange({ ...m, td: { ...m.td, lot_number: ev.target.value } })}
            />
          </Field>
        )}
      </div>
    </fieldset>
  )
}
