import { useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import Button from '../../../../components/ui/Button/Button.jsx'
import Field from '../../../../components/ui/Field/Field.jsx'
import Icone from '../../../../components/ui/Icone/Icone.jsx'
import Input from '../../../../components/ui/Input/Input.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import Radio from '../../../../components/ui/Radio/Radio.jsx'
import Select from '../../../../components/ui/Select/Select.jsx'
import Skeleton from '../../../../components/ui/Skeleton/Skeleton.jsx'
import Textarea from '../../../../components/ui/Textarea/Textarea.jsx'
import { useEnLigne } from '../../../../hooks/useEnLigne.js'
import SectionConsultation from '../../../consultations/components/SectionConsultation/SectionConsultation.jsx'
import { useToast } from '../../../../hooks/useToast.js'
import { cles } from '../../api.js'
import { BCF, LISTES_CPN, NOTE_MAX, normaliserCpn, valeurBcf } from '../../cpn.js'
import { formatSA } from '../../grossesse.js'
import {
  useCpnConsultation,
  useOptionsCpn,
  useReglagesMaternite,
} from '../../hooks/useMaternite.js'
import ModaleOuvertureGrossesse from '../ModaleOuvertureGrossesse/ModaleOuvertureGrossesse.jsx'
import RepereCpn from '../RepereCpn/RepereCpn.jsx'
import './SectionCpn.css'

const ID = 'section-cpn'

// Section « CPN » d'une consultation de type CPN, en brouillon : repères (numéro, terme,
// poids et tension du passage, bilan) et mesures obstétricales, gardées dans le brouillon
// (clé « maternite ») comme le reste de la consultation. Sans grossesse suivie, le suivi
// s'ouvre ici, dans une fenêtre : la consultation reste ouverte et rien n'est perdu.
// valeur : brouillon.maternite ; erreurs : verifierCpn (+ grossesse : suivi à ouvrir) ;
// onChange(nouvelle valeur).
export default function SectionCpn(props) {
  const cpn = useCpnConsultation(props.consultation.id, true)
  const d = cpn.data
  const erreurs = props.erreurs ?? {}
  const resume = d?.pregnancy
    ? `CPN n° ${d.anc_number} · ${formatSA(d.pregnancy.ga_days)}`
    : 'Suivi de grossesse à ouvrir'
  return (
    <SectionConsultation
      titre="CPN"
      resume={cpn.isPending ? null : resume}
      alerte={Object.values(erreurs).some(Boolean)}
    >
      <CorpsCpn {...props} erreurs={erreurs} cpn={cpn} />
    </SectionConsultation>
  )
}

function CorpsCpn({ consultation, patient, orgId, valeur, erreurs, desactive, onChange, cpn }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const enLigne = useEnLigne()
  const options = useOptionsCpn(orgId)
  const reglages = useReglagesMaternite(orgId)
  const [ouverture, setOuverture] = useState(false)
  const [avertissement, setAvertissement] = useState(null)
  const m = normaliserCpn(valeur)

  const maj = (champ, v) => onChange({ ...m, [champ]: v })

  async function ouverte(_id, alerte) {
    setOuverture(false)
    setAvertissement(alerte ?? null)
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: cles.cpnConsultation(consultation.id) }),
      queryClient.invalidateQueries({ queryKey: cles.grossessesPatiente(consultation.patient_id) }),
    ])
    toast.succes('Suivi de grossesse ouvert')
  }

  if (cpn.isPending) return <Skeleton forme="bloc" hauteur="8rem" />
  if (cpn.error) {
    return (
      <Message ton="erreur" action={<Button onClick={() => cpn.refetch()}>Réessayer</Button>}>
        <p>{cpn.error.message}</p>
        <p>Votre saisie reste dans le brouillon.</p>
      </Message>
    )
  }
  const d = cpn.data
  const choix = (liste) =>
    (options.data ?? []).filter(
      (o) => o.list_code === liste.code && (o.is_active || o.id === m[liste.cle]),
    )

  return (
    <div id={ID} className="section-cpn">
      {avertissement && (
        <Message ton="erreur" titre="Groupe sanguin non enregistré">
          <p>{avertissement}</p>
        </Message>
      )}
      {d.pregnancy ? (
        <RepereCpn cpn={d} />
      ) : patient?.sex === 'M' ? (
        <Message ton="info" titre="La CPN concerne une patiente">
          <p>Changez le type de consultation.</p>
        </Message>
      ) : (
        <Message
          ton="info"
          titre="Aucune grossesse suivie pour cette patiente"
          action={
            <Button
              iconeDebut={<Icone icone={Plus} />}
              disabled={!enLigne || desactive || reglages.isPending || !reglages.data}
              onClick={() => setOuverture(true)}
            >
              Ouvrir le suivi de grossesse
            </Button>
          }
        >
          <p>
            Ouvrez le suivi pour numéroter cette CPN et calculer le terme. La consultation reste
            ouverte : votre saisie est gardée.
          </p>
          {!enLigne && <p>Pas de connexion : ouvrez le suivi au retour du réseau.</p>}
        </Message>
      )}
      {erreurs.grossesse && !d.pregnancy && (
        <Message ton="erreur">
          <p>{erreurs.grossesse}</p>
        </Message>
      )}

      <div className="section-cpn__champs">
        <Field
          id={`${ID}-hauteur`}
          label="Hauteur utérine"
          facultatif
          erreur={erreurs.fundal_height_cm}
        >
          <Input
            mono
            inputMode="decimal"
            maxLength={5}
            suffixe="cm"
            value={m.fundal_height_cm}
            disabled={desactive}
            onChange={(e) => maj('fundal_height_cm', e.target.value)}
          />
        </Field>

        <Field groupe label="Bruits du cœur fœtal (BCF)" className="section-cpn__bcf">
          <div className="section-cpn__radios">
            {BCF.map((b) => (
              <Radio
                key={b.valeur}
                name={`${ID}-bcf`}
                label={b.libelle}
                checked={valeurBcf(m.fetal_heart_heard) === b.valeur}
                disabled={desactive}
                onChange={() =>
                  onChange({
                    ...m,
                    fetal_heart_heard: b.heard,
                    // La fréquence n'a de sens que pour des BCF perçus.
                    fetal_heart_rate: b.heard === true ? m.fetal_heart_rate : '',
                  })
                }
              />
            ))}
          </div>
        </Field>
        {m.fetal_heart_heard === true && (
          <Field
            id={`${ID}-frequence`}
            label="Fréquence des BCF"
            facultatif
            erreur={erreurs.fetal_heart_rate}
          >
            <Input
              mono
              inputMode="numeric"
              maxLength={3}
              suffixe="/min"
              value={m.fetal_heart_rate}
              disabled={desactive}
              onChange={(e) => maj('fetal_heart_rate', e.target.value)}
            />
          </Field>
        )}
        {m.fetal_heart_heard !== true && erreurs.fetal_heart_rate && (
          <p className="section-cpn__erreur" role="alert">
            {erreurs.fetal_heart_rate}
          </p>
        )}

        {LISTES_CPN.map((liste) => (
          <Field
            key={liste.code}
            id={`${ID}-${liste.code}`}
            label={liste.libelle}
            facultatif
            erreur={erreurs[liste.cle]}
          >
            <Select
              value={m[liste.cle] ?? ''}
              disabled={desactive || options.isPending}
              options={[
                { valeur: '', libelle: 'Non noté' },
                ...choix(liste).map((o) => ({ valeur: o.id, libelle: o.label })),
              ]}
              onChange={(e) => maj(liste.cle, e.target.value)}
            />
          </Field>
        ))}
        {options.error && (
          <Message
            ton="erreur"
            action={<Button onClick={() => options.refetch()}>Réessayer</Button>}
          >
            <p>{options.error.message}</p>
          </Message>
        )}

        <Field
          id={`${ID}-note`}
          label="Remarque de la CPN"
          facultatif
          erreur={erreurs.note}
          className="section-cpn__large"
        >
          <Textarea
            rows={2}
            maxLength={NOTE_MAX}
            value={m.note}
            disabled={desactive}
            onChange={(e) => maj('note', e.target.value)}
          />
        </Field>
      </div>

      {ouverture && reglages.data && (
        <ModaleOuvertureGrossesse
          patient={patient ?? { id: consultation.patient_id }}
          reglages={reglages.data}
          onFermer={() => setOuverture(false)}
          onOuverte={ouverte}
        />
      )}
    </div>
  )
}
