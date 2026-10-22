import { useEffect } from 'react'
import Button from '../../../../components/ui/Button/Button.jsx'
import Checkbox from '../../../../components/ui/Checkbox/Checkbox.jsx'
import Field from '../../../../components/ui/Field/Field.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import Skeleton from '../../../../components/ui/Skeleton/Skeleton.jsx'
import Textarea from '../../../../components/ui/Textarea/Textarea.jsx'
import SectionConsultation from '../../../consultations/components/SectionConsultation/SectionConsultation.jsx'
import { useSoinsConsultation, useTypesSoins } from '../../hooks/useMaternite.js'
import { normaliserSoins, situationsCochees } from '../../soins.js'
import ResultatsExterieursCpn from '../ResultatsExterieursCpn/ResultatsExterieursCpn.jsx'
import SoinsCpn from '../SoinsCpn/SoinsCpn.jsx'
import './SectionSoinsCpn.css'

const ID = 'soins-cpn'

// Section « Soins de la CPN » d'une consultation CPN en brouillon (soignants habilités) :
// situation de la grossesse (« Sous cotrimoxazole », confidentielle : seulement ici),
// soins préventifs et Td faits pendant la CPN, « Ajouter à l'ordonnance », conseils donnés,
// résultats d'un laboratoire extérieur. Tout est gardé dans le brouillon (clé « maternite »)
// et recopié par la base à la validation, qui contrôle les règles.
//   valeur : brouillon.maternite ; onChange(nouvelle valeur) ;
//   ordonnance / onOrdonnance : ordonnance du brouillon ; examens : examens rapides.
export default function SectionSoinsCpn({
  consultation,
  orgId,
  valeur,
  erreurs = {},
  desactive,
  onChange,
  ordonnance,
  onOrdonnance,
  examens,
}) {
  const requete = useSoinsConsultation(consultation.id, true)
  const types = useTypesSoins(orgId)
  const m = normaliserSoins(valeur)
  const faits = m.interventions.length + (m.td?.given ? 1 : 0)
  const alerte = Boolean(erreurs.fin || erreurs.externes)
  return (
    <SectionConsultation
      titre="Soins de la CPN"
      resume={
        requete.isPending
          ? null
          : faits
            ? `${faits} soin${faits > 1 ? 's' : ''} noté${faits > 1 ? 's' : ''}`
            : 'Aucun soin noté'
      }
      alerte={alerte}
    >
      {requete.isPending && <Skeleton forme="bloc" hauteur="8rem" />}
      {requete.error && (
        <Message ton="erreur" action={<Button onClick={() => requete.refetch()}>Réessayer</Button>}>
          <p>{requete.error.message}</p>
          <p>Votre saisie reste dans le brouillon.</p>
        </Message>
      )}
      {requete.data && !requete.data.pregnancy_id && (
        <p className="soins-cpn__vide">
          Ouvrez le suivi de grossesse (section CPN) pour noter les soins.
        </p>
      )}
      {requete.data?.pregnancy_id && (
        <Corps
          d={requete.data}
          types={types.data ?? []}
          m={m}
          erreurs={erreurs}
          desactive={desactive}
          onChange={onChange}
          ordonnance={ordonnance}
          onOrdonnance={onOrdonnance}
          examens={examens}
        />
      )}
    </SectionConsultation>
  )
}

function Corps({ d, types, m, erreurs, desactive, onChange, ordonnance, onOrdonnance, examens }) {
  const cochees = situationsCochees(m, d.conditions)
  const maj = (champ, v) => onChange({ ...m, [champ]: v })

  // Situation déjà en cours (CPN précédente) : recopiée dans le brouillon dès l'ouverture,
  // pour que cette CPN, qui l'affiche, soit sensible elle aussi.
  const enCours = d.conditions.filter((s) => s.active).map((s) => s.code)
  const aRecopier = !desactive && !Array.isArray(m.conditions) && enCours.length > 0
  useEffect(() => {
    if (aRecopier) onChange({ ...m, conditions: enCours })
  })

  function basculerSituation(s, coche) {
    const liste = coche ? [...new Set([...cochees, s.code])] : cochees.filter((c) => c !== s.code)
    onChange({ ...m, conditions: liste })
  }

  return (
    <div id={ID} className="soins-cpn">
      {d.conditions.length > 0 && (
        <fieldset className="soins-cpn__bloc">
          <legend className="soins-cpn__titre">Situation de la grossesse</legend>
          <div className="soins-cpn__confidentiel">
            <p className="soins-cpn__aide">
              Confidentiel : visible seulement dans cet écran, jamais imprimé. La consultation
              devient sensible.
            </p>
            {d.conditions.map((s) => {
              const coche = cochees.includes(s.code)
              return (
                <div key={s.code} className="soins-cpn__situation">
                  <Checkbox
                    label={s.label}
                    checked={coche}
                    disabled={desactive}
                    onChange={(e) => basculerSituation(s, e.target.checked)}
                  />
                  {s.active && !coche && (
                    <Field
                      id={`${ID}-fin-${s.code}`}
                      label="Pourquoi décocher ?"
                      requis
                      erreur={erreurs.fin?.[s.code]}
                    >
                      <Textarea
                        rows={2}
                        maxLength={300}
                        value={m.condition_end_reasons?.[s.code] ?? ''}
                        disabled={desactive}
                        onChange={(e) =>
                          maj('condition_end_reasons', {
                            ...m.condition_end_reasons,
                            [s.code]: e.target.value,
                          })
                        }
                      />
                    </Field>
                  )}
                </div>
              )
            })}
          </div>
        </fieldset>
      )}

      <SoinsCpn
        soins={d.care}
        td={d.td}
        types={types}
        valeur={m}
        bloques={cochees}
        desactive={desactive}
        onChange={onChange}
        ordonnance={ordonnance}
        onOrdonnance={onOrdonnance}
      />

      {d.topics.length > 0 && (
        <fieldset className="soins-cpn__bloc">
          <legend className="soins-cpn__titre">Conseils donnés</legend>
          <div className="soins-cpn__conseils">
            {d.topics.map((t) => (
              <Checkbox
                key={t.id}
                label={t.label}
                checked={m.counselling.includes(t.id)}
                disabled={desactive}
                onChange={(e) =>
                  maj(
                    'counselling',
                    e.target.checked
                      ? [...m.counselling, t.id]
                      : m.counselling.filter((x) => x !== t.id),
                  )
                }
              />
            ))}
          </div>
        </fieldset>
      )}

      <ResultatsExterieursCpn
        examens={examens}
        valeur={m.external_tests}
        erreurs={erreurs.externes}
        desactive={desactive}
        onChange={(v) => maj('external_tests', v)}
      />
    </div>
  )
}
