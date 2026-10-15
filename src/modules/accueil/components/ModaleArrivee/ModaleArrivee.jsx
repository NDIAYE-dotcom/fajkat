import { useEffect, useState } from 'react'
import Button from '../../../../components/ui/Button/Button.jsx'
import Field from '../../../../components/ui/Field/Field.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import Modal from '../../../../components/ui/Modal/Modal.jsx'
import Radio from '../../../../components/ui/Radio/Radio.jsx'
import Skeleton from '../../../../components/ui/Skeleton/Skeleton.jsx'
import Textarea from '../../../../components/ui/Textarea/Textarea.jsx'
import { useBrouillon } from '../../../../hooks/useBrouillon.js'
import { useEnLigne } from '../../../../hooks/useEnLigne.js'
import { formatHeure } from '../../../../lib/format.js'
import LignePatient from '../../../patients/components/LignePatient/LignePatient.jsx'
import { enregistrerArrivee } from '../../api.js'
import { usePriorites, useServicesFile } from '../../hooks/useFile.js'
import {
  ARRIVEE_VIDE,
  MOTIF_MAX,
  ORDRE_CHAMPS_ARRIVEE,
  resumePatient,
  validerArrivee,
} from '../../utils.js'
import ChoixPatient from '../ChoixPatient/ChoixPatient.jsx'
import './ModaleArrivee.css'

const ID = 'arrivee'

// Arrivée d'un patient : qui, pour quel service, avec quelle priorité, et le motif.
// Le motif peut être sensible (dépistage…) : il n'est relu que par les soignants.
// Brouillon automatique (coupures de courant), effacé après l'enregistrement.
// patientCree : dossier créé (ou retrouvé) pendant que la fenêtre était fermée.
export default function ModaleArrivee({
  orgId,
  peutCreerPatient,
  patientCree,
  onFermer,
  onNouveauPatient,
  onEnregistree,
}) {
  const enLigne = useEnLigne()
  const services = useServicesFile(orgId)
  const priorites = usePriorites()
  const brouillon = useBrouillon(`accueil.arrivee.${orgId}`, ARRIVEE_VIDE)
  const v = brouillon.valeur
  const [erreurs, setErreurs] = useState({})
  const [envoi, setEnvoi] = useState(false)
  const [echec, setEchec] = useState(null)

  // Retour de la création rapide : le nouveau dossier devient le patient de l'arrivée.
  const setValeur = brouillon.setValeur
  useEffect(() => {
    if (patientCree) setValeur((p) => ({ ...p, patient: resumePatient(patientCree) }))
  }, [patientCree, setValeur])

  // Un seul service : choisi d'office.
  const listeServices = services.data ?? []
  const serviceUnique = listeServices.length === 1 ? listeServices[0].id : ''
  useEffect(() => {
    if (serviceUnique) setValeur((p) => (p.serviceId ? p : { ...p, serviceId: serviceUnique }))
  }, [serviceUnique, setValeur])

  function maj(champ, valeur) {
    setValeur((p) => ({ ...p, [champ]: valeur }))
    setErreurs((e) => ({ ...e, [champ]: undefined }))
    setEchec(null)
  }

  async function surEnvoi(evenement) {
    evenement.preventDefault()
    const trouvees = validerArrivee(v)
    setErreurs(trouvees)
    const premiere = ORDRE_CHAMPS_ARRIVEE.find((c) => trouvees[c])
    if (premiere) {
      document.querySelector(`#${ID} [data-champ='${premiere}'] :is(input, textarea)`)?.focus()
      return
    }
    setEnvoi(true)
    setEchec(null)
    try {
      const visite = await enregistrerArrivee(orgId, {
        patientId: v.patient.id,
        serviceId: v.serviceId,
        priorite: v.priorite,
        motif: v.motif,
      })
      const service = listeServices.find((s) => s.id === v.serviceId)
      brouillon.effacer()
      onEnregistree(visite, service)
    } catch (e) {
      setEchec(e.message)
    } finally {
      setEnvoi(false)
    }
  }

  const chargement = services.isPending || priorites.isPending
  const erreurChargement = services.error ?? priorites.error

  return (
    <Modal
      ouvert
      onFermer={onFermer}
      taille="large"
      fermerSurVoile={false}
      titre="Nouvelle arrivée"
      description="Le numéro de ticket est attribué à l’enregistrement, service par service."
      actions={
        <Button type="submit" form={ID} chargement={envoi} disabled={!enLigne || chargement}>
          Enregistrer l’arrivée
        </Button>
      }
    >
      <form id={ID} className="arrivee" noValidate onSubmit={surEnvoi}>
        {brouillon.restaure && brouillon.enregistreLe && (
          <Message ton="info">
            <p>Votre saisie de {formatHeure(brouillon.enregistreLe)} a été retrouvée.</p>
            <Button
              variante="discret"
              onClick={() => {
                brouillon.effacer()
                setErreurs({})
              }}
            >
              Effacer la saisie
            </Button>
          </Message>
        )}

        <section className="arrivee__bloc" data-champ="patient" aria-labelledby={`${ID}-qui`}>
          <h3 id={`${ID}-qui`} className="arrivee__titre">
            Patient
          </h3>
          {v.patient ? (
            <div className="arrivee__patient">
              <LignePatient patient={v.patient} />
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
                  <div className="arrivee__choix">
                    {listeServices.map((s) => (
                      <Radio
                        key={s.id}
                        name={`${ID}-service`}
                        value={s.id}
                        checked={v.serviceId === s.id}
                        onChange={() => maj('serviceId', s.id)}
                        label={
                          <>
                            <span className="arrivee__lettre">{s.letter}</span> {s.label}
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
                <div className="arrivee__choix">
                  {(priorites.data ?? []).map((p) => (
                    <Radio
                      key={p.code}
                      name={`${ID}-priorite`}
                      value={p.code}
                      checked={v.priorite === p.code}
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
              value={v.motif}
              onChange={(e) => maj('motif', e.target.value)}
            />
          </Field>
        </div>

        {!enLigne && (
          <Message ton="info" titre="Vous êtes hors ligne">
            <p>La saisie est gardée sur cet appareil. Enregistrez dès le retour de la connexion.</p>
          </Message>
        )}
        {echec && (
          <Message ton="erreur" titre="Arrivée non enregistrée">
            <p>{echec}</p>
            <p>Votre saisie est conservée sur cet appareil.</p>
          </Message>
        )}
      </form>
    </Modal>
  )
}
