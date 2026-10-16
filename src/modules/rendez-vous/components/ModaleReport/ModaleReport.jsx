import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import Button from '../../../../components/ui/Button/Button.jsx'
import Checkbox from '../../../../components/ui/Checkbox/Checkbox.jsx'
import DateInput from '../../../../components/ui/DateInput/DateInput.jsx'
import Field from '../../../../components/ui/Field/Field.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import Modal from '../../../../components/ui/Modal/Modal.jsx'
import Skeleton from '../../../../components/ui/Skeleton/Skeleton.jsx'
import { useEnLigne } from '../../../../hooks/useEnLigne.js'
import { useToast } from '../../../../hooks/useToast.js'
import { formatHeure } from '../../../../lib/format.js'
import { nomComplet } from '../../../patients/utils.js'
import { reporterRdv } from '../../api.js'
import { useRdvAReporter } from '../../hooks/useParametresAgenda.js'
import { dateFr, dateLongue, versDateInput } from '../../utils.js'
import './ModaleReport.css'

// Rendez-vous déjà pris un jour qui devient férié (la Korité, la Tabaski ne sont souvent
// confirmées que la veille) : liste, puis report en un geste vers un autre jour, à la même
// heure. Tout ou rien ; un avertissement (pause, autre jour férié…) se confirme.
export default function ModaleReport({ orgId, date, libelle, onFermer }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const enLigne = useEnLigne()
  const rdv = useRdvAReporter(orgId, date)
  const [exclus, setExclus] = useState(() => new Set())
  const [nouvelle, setNouvelle] = useState(() => versDateInput(null))
  const [erreurDate, setErreurDate] = useState(null)
  const [erreur, setErreur] = useState(null)
  const [aConfirmer, setAConfirmer] = useState(null)
  const [envoi, setEnvoi] = useState(false)

  const liste = rdv.data ?? []
  const choisis = liste.filter((r) => !exclus.has(r.id))

  function basculer(id) {
    setAConfirmer(null)
    setExclus((p) => {
      const n = new Set(p)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  async function reporter(confirmer) {
    if (!nouvelle.date) {
      setErreurDate(
        nouvelle.texte
          ? 'Cette date n’existe pas : vérifiez le jour et le mois.'
          : 'Tapez la nouvelle date (JJ/MM/AAAA).',
      )
      return
    }
    if (nouvelle.date === date) {
      setErreurDate('Choisissez un autre jour que le jour férié.')
      return
    }
    setErreurDate(null)
    setErreur(null)
    setEnvoi(true)
    try {
      const reportes = await reporterRdv(
        choisis.map((r) => r.id),
        nouvelle.date,
        confirmer,
      )
      setAConfirmer(null)
      setExclus(new Set())
      toast.succes(
        `${reportes.length} rendez-vous reporté${reportes.length > 1 ? 's' : ''} au ${dateFr(nouvelle.date)}.`,
      )
      await queryClient.invalidateQueries({ queryKey: ['rendez-vous'] })
    } catch (e) {
      if (e.confirmation) setAConfirmer(e.message)
      else setErreur(e.message)
    } finally {
      setEnvoi(false)
    }
  }

  const actions = (
    <>
      <Button variante="secondaire" onClick={onFermer}>
        Fermer
      </Button>
      {liste.length > 0 && !aConfirmer && (
        <Button
          chargement={envoi}
          disabled={!enLigne || choisis.length === 0}
          onClick={() => reporter(false)}
        >
          {`Reporter ${choisis.length} rendez-vous`}
        </Button>
      )}
      {aConfirmer && (
        <Button chargement={envoi} disabled={!enLigne} onClick={() => reporter(true)}>
          Reporter quand même
        </Button>
      )}
    </>
  )

  return (
    <Modal
      ouvert
      onFermer={onFermer}
      taille="large"
      titre={`Rendez-vous du ${dateLongue(date)}`}
      description={
        libelle
          ? `${libelle} : jour férié. Reportez les rendez-vous déjà pris, puis prévenez les patients.`
          : undefined
      }
      actions={actions}
    >
      <div className="modale-report">
        {rdv.error && (
          <Message ton="erreur" action={<Button onClick={() => rdv.refetch()}>Réessayer</Button>}>
            <p>{rdv.error.message}</p>
          </Message>
        )}
        {rdv.isPending && <Skeleton forme="bloc" hauteur="8rem" />}
        {rdv.data && liste.length === 0 && (
          <Message ton="info">
            <p>Aucun rendez-vous à reporter ce jour-là.</p>
          </Message>
        )}

        {liste.length > 0 && (
          <>
            <fieldset className="modale-report__liste">
              <legend className="modale-report__legende">
                {`${liste.length} rendez-vous pris ce jour-là — décochez ceux à garder`}
              </legend>
              {liste.map((r) => (
                <Checkbox
                  key={r.id}
                  checked={!exclus.has(r.id)}
                  onChange={() => basculer(r.id)}
                  label={
                    <span className="modale-report__rdv">
                      <span className="modale-report__heure">{formatHeure(r.starts_at)}</span>
                      {nomComplet({
                        last_name: r.patient_last_name,
                        first_name: r.patient_first_name,
                      })}
                    </span>
                  }
                  description={[r.type_label, r.practitioner_name, r.file_number]
                    .filter(Boolean)
                    .join(' · ')}
                />
              ))}
            </fieldset>

            <Field
              label="Reporter au"
              aide="Même heure, même type ; l’ancien rendez-vous reste visible comme « reporté »."
              erreur={erreurDate}
              requis
            >
              <DateInput
                value={nouvelle}
                onChange={(v) => {
                  setNouvelle(v)
                  setAConfirmer(null)
                }}
              />
            </Field>
          </>
        )}

        {erreur && (
          <Message ton="erreur">
            <p>{erreur}</p>
          </Message>
        )}
        {aConfirmer && (
          <Message ton="info" titre="À confirmer avant de reporter">
            <p>{aConfirmer.replace(/^À confirmer : /, '')}</p>
          </Message>
        )}
      </div>
    </Modal>
  )
}
