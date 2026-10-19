import { useState } from 'react'
import Button from '../../../../components/ui/Button/Button.jsx'
import Field from '../../../../components/ui/Field/Field.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import Modal from '../../../../components/ui/Modal/Modal.jsx'
import Select from '../../../../components/ui/Select/Select.jsx'
import { useEnLigne } from '../../../../hooks/useEnLigne.js'
import { formatHeure } from '../../../../lib/format.js'
import { nomComplet } from '../../../patients/utils.js'
import { changerTypeRdv } from '../../api.js'
import { useEnvoiRdv } from '../../hooks/useEnvoiRdv.js'
import { useTypesRdv } from '../../hooks/useParametresAgenda.js'
import { dateLongue, libelleDuree } from '../../utils.js'
import ControleRdv from '../ControleRdv/ControleRdv.jsx'

import './ModaleTypeRdv.css'

const ID = 'type-rdv'

// Changer le type d'un rendez-vous : soignants seulement (la base refuse les autres).
// Exemple : l'accueil a pris une « Consultation », la sage-femme en fait une planification
// familiale. Même heure ; séance et durée du nouveau type ; jour férié à confirmer.
export default function ModaleTypeRdv({ orgId, rdv, onFermer, onChange }) {
  const enLigne = useEnLigne()
  const types = useTypesRdv(orgId)
  const envoi = useEnvoiRdv()
  const [typeId, setTypeId] = useState(rdv.appointment_type_id ?? '')
  const [erreur, setErreur] = useState(null)
  const actifs = (types.data ?? []).filter((t) => t.is_active)

  async function envoyer(confirmer = false) {
    if (!typeId) {
      setErreur('Choisissez le nouveau type.')
      return
    }
    if (typeId === rdv.appointment_type_id) {
      setErreur('Choisissez un autre type que le type actuel.')
      return
    }
    const ok = await envoi.envoyer({
      confirmer,
      verifier: async () => ({}),
      enregistrer: (conf) => changerTypeRdv(rdv.id, typeId, conf),
    })
    if (ok) onChange(ok.resultat)
  }

  const nom = nomComplet({ last_name: rdv.patient_last_name, first_name: rdv.patient_first_name })

  return (
    <Modal
      ouvert
      onFermer={onFermer}
      titre="Changer le type"
      description={`${nom} — ${dateLongue(rdv.local_date)} à ${formatHeure(rdv.starts_at)}.`}
      actions={
        <Button
          type="submit"
          form={ID}
          chargement={envoi.envoi}
          disabled={!enLigne || types.isPending}
        >
          Changer le type
        </Button>
      }
    >
      <form
        id={ID}
        className="modale-type-rdv"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          envoyer()
        }}
      >
        {types.error && (
          <Message ton="erreur" action={<Button onClick={() => types.refetch()}>Réessayer</Button>}>
            <p>{types.error.message}</p>
          </Message>
        )}
        <Field
          label="Nouveau type"
          requis
          aide="Le rendez-vous garde sa date et son heure."
          erreur={erreur}
        >
          <Select
            value={typeId}
            onChange={(e) => {
              setTypeId(e.target.value)
              setErreur(null)
              envoi.reinitialiser()
            }}
            placeholder="Choisissez un type"
            options={actifs.map((t) => ({
              valeur: t.id,
              libelle: `${t.label} (${libelleDuree(t.duration_minutes)})`,
            }))}
          />
        </Field>
        <ControleRdv
          controle={envoi.controle}
          propositions={null}
          envoi={envoi.envoi}
          desactive={!enLigne}
          onChoisir={() => {}}
          onConfirmer={() => envoyer(true)}
        />
        {!enLigne && (
          <Message ton="info" titre="Vous êtes hors ligne">
            <p>Changez le type dès le retour de la connexion.</p>
          </Message>
        )}
        {envoi.echec && (
          <Message ton="erreur" titre="Type non changé">
            <p>{envoi.echec}</p>
          </Message>
        )}
      </form>
    </Modal>
  )
}
