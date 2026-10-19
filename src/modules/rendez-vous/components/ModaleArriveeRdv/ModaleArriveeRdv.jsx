import { useState } from 'react'
import Button from '../../../../components/ui/Button/Button.jsx'
import Field from '../../../../components/ui/Field/Field.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import Modal from '../../../../components/ui/Modal/Modal.jsx'
import Select from '../../../../components/ui/Select/Select.jsx'
import Skeleton from '../../../../components/ui/Skeleton/Skeleton.jsx'
import { useEnLigne } from '../../../../hooks/useEnLigne.js'
import { formatHeure } from '../../../../lib/format.js'
import { usePriorites } from '../../../accueil/hooks/useFile.js'
import { nomComplet } from '../../../patients/utils.js'
import { arriverRdv } from '../../api.js'
import { useServicesFile, useTypesRdv } from '../../hooks/useParametresAgenda.js'
import './ModaleArriveeRdv.css'

const ID = 'arrivee-rdv'

// « Arrivé » : le patient entre dans la file d'attente du type de son rendez-vous, avec un
// numéro de ticket. La file n'est demandée que si le type n'en a pas ; pour un rendez-vous
// discret affiché « Consultation », la base choisit elle-même la file du vrai type.
// onArrive(visite) : passage créé (ticket à imprimer).
export default function ModaleArriveeRdv({ orgId, rdv, onFermer, onArrive }) {
  const enLigne = useEnLigne()
  const types = useTypesRdv(orgId)
  const services = useServicesFile(orgId)
  const priorites = usePriorites()
  const [priorite, setPriorite] = useState('normal')
  const [serviceChoisi, setServiceChoisi] = useState('')
  const [erreur, setErreur] = useState(null)
  const [echec, setEchec] = useState(null)
  const [envoi, setEnvoi] = useState(false)

  const fileDuType = types.data?.find((t) => t.id === rdv.appointment_type_id)?.queue_service_id
  const demanderFile = Boolean(types.data) && !fileDuType
  const nom = nomComplet({ last_name: rdv.patient_last_name, first_name: rdv.patient_first_name })
  const chargement = types.isPending || services.isPending || priorites.isPending
  const erreurChargement = types.error ?? services.error ?? priorites.error

  async function envoyer(e) {
    e.preventDefault()
    if (demanderFile && !serviceChoisi) {
      setErreur('Choisissez la file d’attente.')
      return
    }
    setEnvoi(true)
    setEchec(null)
    try {
      const visite = await arriverRdv(rdv.id, {
        serviceId: demanderFile ? serviceChoisi : fileDuType,
        priorite,
      })
      onArrive(visite)
    } catch (err) {
      setEchec(err.message)
    } finally {
      setEnvoi(false)
    }
  }

  return (
    <Modal
      ouvert
      onFermer={onFermer}
      fermerSurVoile={false}
      titre="Arrivée du patient"
      description={`${nom}, rendez-vous de ${formatHeure(rdv.starts_at)}`}
      actions={
        <Button
          type="submit"
          form={ID}
          chargement={envoi}
          disabled={!enLigne || chargement || Boolean(erreurChargement)}
        >
          Enregistrer l’arrivée
        </Button>
      }
    >
      <form id={ID} className="modale-arrivee-rdv" noValidate onSubmit={envoyer}>
        {erreurChargement && (
          <Message ton="erreur">
            <p>{erreurChargement.message}</p>
          </Message>
        )}
        {chargement && !erreurChargement && <Skeleton forme="bloc" hauteur="5rem" />}
        {!chargement && !erreurChargement && (
          <>
            <p className="modale-arrivee-rdv__texte">
              Le patient entre dans la file prévue pour ce rendez-vous et reçoit un ticket.
            </p>
            {demanderFile && (
              <Field label="File d’attente" requis erreur={erreur}>
                <Select
                  value={serviceChoisi}
                  placeholder="Choisissez une file"
                  onChange={(ev) => {
                    setServiceChoisi(ev.target.value)
                    setErreur(null)
                  }}
                  options={(services.data ?? []).map((s) => ({
                    valeur: s.id,
                    libelle: `${s.letter} — ${s.label}`,
                  }))}
                />
              </Field>
            )}
            <Field label="Priorité">
              <Select
                value={priorite}
                onChange={(ev) => setPriorite(ev.target.value)}
                options={(priorites.data ?? []).map((p) => ({ valeur: p.code, libelle: p.label }))}
              />
            </Field>
          </>
        )}
        {!enLigne && (
          <Message ton="info" titre="Vous êtes hors ligne">
            <p>L’arrivée pourra être enregistrée dès le retour de la connexion.</p>
          </Message>
        )}
        {echec && (
          <Message ton="erreur" titre="Arrivée non enregistrée">
            <p>{echec}</p>
          </Message>
        )}
      </form>
    </Modal>
  )
}
