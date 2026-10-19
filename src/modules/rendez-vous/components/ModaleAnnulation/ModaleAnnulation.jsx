import { useState } from 'react'
import Button from '../../../../components/ui/Button/Button.jsx'
import Field from '../../../../components/ui/Field/Field.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import Modal from '../../../../components/ui/Modal/Modal.jsx'
import Radio from '../../../../components/ui/Radio/Radio.jsx'
import Textarea from '../../../../components/ui/Textarea/Textarea.jsx'
import { useEnLigne } from '../../../../hooks/useEnLigne.js'
import { formatHeure } from '../../../../lib/format.js'
import { nomComplet } from '../../../patients/utils.js'
import { changerStatutRdv } from '../../api.js'
import { MOTIF_MAX, MOTIFS_ANNULATION, motifAnnulation } from '../../suivi.js'
import { dateFr } from '../../utils.js'
import './ModaleAnnulation.css'

const ID = 'annulation-rdv'

// Annulation d'un rendez-vous : motif obligatoire (la base le refuse vide). Un clic sur un
// motif courant ; « Autre » demande un texte. L'ancien rendez-vous reste, au statut
// « Annulé ». La saisie reste dans la fenêtre si l'envoi échoue.
export default function ModaleAnnulation({ rdv, onFermer, onAnnule }) {
  const enLigne = useEnLigne()
  const [choix, setChoix] = useState('')
  const [autre, setAutre] = useState('')
  const [erreur, setErreur] = useState(null)
  const [echec, setEchec] = useState(null)
  const [envoi, setEnvoi] = useState(false)
  const nom = nomComplet({ last_name: rdv.patient_last_name, first_name: rdv.patient_first_name })

  async function envoyer(e) {
    e.preventDefault()
    const { motif, erreur: invalide } = motifAnnulation({ choix, autre })
    if (invalide) {
      setErreur(invalide)
      document.querySelector(`#${ID} :is(textarea, input)`)?.focus()
      return
    }
    setEnvoi(true)
    setEchec(null)
    try {
      const ligne = await changerStatutRdv(rdv.id, 'cancelled', motif)
      onAnnule({ ...rdv, status: ligne?.status ?? 'cancelled' })
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
      titre="Annuler le rendez-vous"
      description={`${nom}, le ${dateFr(rdv.local_date)} à ${formatHeure(rdv.starts_at)}`}
      actions={
        <Button type="submit" form={ID} chargement={envoi} disabled={!enLigne}>
          Annuler le rendez-vous
        </Button>
      }
    >
      <form id={ID} className="modale-annulation" noValidate onSubmit={envoyer}>
        <Field label="Motif" groupe requis erreur={choix !== 'Autre' ? erreur : null}>
          <div className="modale-annulation__motifs">
            {MOTIFS_ANNULATION.map((m) => (
              <Radio
                key={m}
                name={`${ID}-motif`}
                value={m}
                checked={choix === m}
                onChange={() => {
                  setChoix(m)
                  setErreur(null)
                }}
                label={m}
              />
            ))}
          </div>
        </Field>
        {choix === 'Autre' && (
          <Field label="Motif de l’annulation" requis erreur={erreur}>
            <Textarea
              rows={2}
              maxLength={MOTIF_MAX}
              value={autre}
              onChange={(e) => {
                setAutre(e.target.value)
                setErreur(null)
              }}
            />
          </Field>
        )}
        <p className="modale-annulation__aide">
          N’indiquez aucun diagnostic : le motif est lu par toute l’équipe de l’agenda.
        </p>
        {!enLigne && (
          <Message ton="info" titre="Vous êtes hors ligne">
            <p>Le rendez-vous pourra être annulé dès le retour de la connexion.</p>
          </Message>
        )}
        {echec && (
          <Message ton="erreur" titre="Rendez-vous non annulé">
            <p>{echec}</p>
          </Message>
        )}
      </form>
    </Modal>
  )
}
