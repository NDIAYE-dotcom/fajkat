import Button from '../../../../components/ui/Button/Button.jsx'
import Field from '../../../../components/ui/Field/Field.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import Radio from '../../../../components/ui/Radio/Radio.jsx'
import Skeleton from '../../../../components/ui/Skeleton/Skeleton.jsx'
import Textarea from '../../../../components/ui/Textarea/Textarea.jsx'
import LignePatient from '../../../patients/components/LignePatient/LignePatient.jsx'
import { MOTIF_MAX, resumePatient } from '../../utils.js'
import ChoixPatient from '../ChoixPatient/ChoixPatient.jsx'
import './ChampsArrivee.css'

// Champs communs à l'arrivée et à la vente d'un ticket : patient, service de la file,
// priorité, motif. Le motif peut être sensible (dépistage…) : il n'est relu que par les
// soignants. services, priorites : requêtes React Query (useServicesFile, usePriorites).
export default function ChampsArrivee({
  id,
  orgId,
  saisie,
  erreurs,
  maj,
  services,
  priorites,
  peutCreerPatient,
  onNouveauPatient,
}) {
  const listeServices = services.data ?? []
  const chargement = services.isPending || priorites.isPending
  const erreurChargement = services.error ?? priorites.error

  return (
    <>
      <section className="champs-arrivee__bloc" data-champ="patient" aria-labelledby={`${id}-qui`}>
        <h3 id={`${id}-qui`} className="champs-arrivee__titre">
          Patient
        </h3>
        {saisie.patient ? (
          <div className="champs-arrivee__patient">
            <LignePatient patient={saisie.patient} />
            <Button variante="discret" onClick={() => maj('patient', null)}>
              Changer de patient
            </Button>
          </div>
        ) : (
          <ChoixPatient
            orgId={orgId}
            peutCreer={peutCreerPatient}
            erreur={erreurs.patient}
            onChoisir={(p) => maj('patient', resumePatient(p))}
            onNouveau={onNouveauPatient}
          />
        )}
      </section>

      {erreurChargement && (
        <Message
          ton="erreur"
          action={
            <Button
              onClick={() => {
                services.refetch()
                priorites.refetch()
              }}
            >
              Réessayer
            </Button>
          }
        >
          <p>{erreurChargement.message}</p>
        </Message>
      )}
      {chargement && !erreurChargement && <Skeleton forme="bloc" hauteur="10rem" />}

      {!chargement && !erreurChargement && (
        <>
          {listeServices.length === 0 ? (
            <Message ton="info" titre="Aucun service de file">
              <p>
                Le responsable de la structure doit d’abord activer au moins un service de la file
                d’attente.
              </p>
            </Message>
          ) : (
            <div data-champ="serviceId">
              <Field label="Service" groupe requis erreur={erreurs.serviceId}>
                <div className="champs-arrivee__choix">
                  {listeServices.map((s) => (
                    <Radio
                      key={s.id}
                      name={`${id}-service`}
                      value={s.id}
                      checked={saisie.serviceId === s.id}
                      onChange={() => maj('serviceId', s.id)}
                      label={
                        <>
                          <span className="champs-arrivee__lettre">{s.letter}</span> {s.label}
                        </>
                      }
                    />
                  ))}
                </div>
              </Field>
            </div>
          )}

          <div data-champ="priorite">
            <Field
              label="Priorité"
              groupe
              requis
              aide="Les priorités passent avant les autres patients, quel que soit leur numéro."
              erreur={erreurs.priorite}
            >
              <div className="champs-arrivee__choix">
                {(priorites.data ?? []).map((p) => (
                  <Radio
                    key={p.code}
                    name={`${id}-priorite`}
                    value={p.code}
                    checked={saisie.priorite === p.code}
                    onChange={() => maj('priorite', p.code)}
                    label={p.label}
                  />
                ))}
              </div>
            </Field>
          </div>
        </>
      )}

      <div data-champ="motif">
        <Field
          label="Motif de venue"
          aide="Facultatif. Visible seulement par les soignants. N’écrivez que ce que le patient accepte de dire."
          erreur={erreurs.motif}
        >
          <Textarea
            rows={3}
            maxLength={MOTIF_MAX}
            value={saisie.motif}
            onChange={(e) => maj('motif', e.target.value)}
          />
        </Field>
      </div>
    </>
  )
}
