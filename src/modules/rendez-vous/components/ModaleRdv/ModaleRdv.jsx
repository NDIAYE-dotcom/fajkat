import { useState } from 'react'
import Button from '../../../../components/ui/Button/Button.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import Modal from '../../../../components/ui/Modal/Modal.jsx'
import Tampon from '../../../../components/ui/Tampon/Tampon.jsx'
import { useEnLigne } from '../../../../hooks/useEnLigne.js'
import { formatHeure } from '../../../../lib/format.js'
import { nomComplet } from '../../../patients/utils.js'
import { ageOuNaissance, aujourdhui, statutRdv } from '../../agenda.js'
import { changerStatutRdv } from '../../api.js'
import { actionsStatut } from '../../suivi.js'
import { dateLongue } from '../../utils.js'
import ActionsStatut from '../ActionsStatut/ActionsStatut.jsx'
import './ModaleRdv.css'

// Statuts où le rendez-vous peut encore être reporté, ou changer de type (comme la base).
const REPORTABLES = ['scheduled', 'confirmed', 'no_show']
const TYPE_MODIFIABLE = ['scheduled', 'confirmed']

const SUCCES = {
  confirmed: 'Rendez-vous confirmé',
  no_show: 'Patient noté absent',
  scheduled: 'Rendez-vous remis à « prévu »',
}

// Détail d'un rendez-vous de l'agenda, avec ce que le rôle peut en faire. Le type affiché
// est celui que la base renvoie (neutre pour un type discret que le rôle ne voit pas).
// onStatut(rdv, message) : statut changé d'un clic (confirmé, absent, remis à « prévu »).
export default function ModaleRdv({
  rdv,
  droits,
  onFermer,
  onReporter,
  onChangerType,
  onStatut,
  onArrivee,
  onAnnuler,
}) {
  const enLigne = useEnLigne()
  const [enCours, setEnCours] = useState(null)
  const [echec, setEchec] = useState(null)
  const statut = statutRdv(rdv)
  const reportable = droits.write && REPORTABLES.includes(rdv.status)
  // « Changer le type » : soignants habilités seulement, pour tout rendez-vous (étape 14 C).
  const typeModifiable = droits.write && droits.discreet && TYPE_MODIFIABLE.includes(rdv.status)
  const nom = nomComplet({ last_name: rdv.patient_last_name, first_name: rdv.patient_first_name })
  const lignes = [
    ['Quand', `${dateLongue(rdv.local_date)}, ${formatHeure(rdv.starts_at)}`],
    ['Type', rdv.type_label ?? 'Consultation'],
    rdv.practitioner_name && ['Praticien', rdv.practitioner_name],
    rdv.series_index && ['Série', `Rendez-vous n° ${rdv.series_index}`],
    rdv.ticket_number && ['Ticket de file', rdv.ticket_number],
    rdv.cancel_reason && ['Motif d’annulation', rdv.cancel_reason],
    rdv.note && ['Note', rdv.note],
  ].filter(Boolean)

  async function changer(nouveau) {
    setEnCours(nouveau)
    setEchec(null)
    try {
      const ligne = await changerStatutRdv(rdv.id, nouveau)
      onStatut({ ...rdv, status: ligne?.status ?? nouveau }, SUCCES[nouveau])
    } catch (e) {
      setEchec(e.message)
    } finally {
      setEnCours(null)
    }
  }

  return (
    <Modal
      ouvert
      onFermer={onFermer}
      titre="Rendez-vous"
      description={nom}
      actions={
        (typeModifiable || reportable) && (
          <>
            {typeModifiable && (
              <Button variante="secondaire" onClick={onChangerType} disabled={Boolean(enCours)}>
                Changer le type
              </Button>
            )}
            {reportable && (
              <Button onClick={onReporter} disabled={Boolean(enCours)}>
                Reporter
              </Button>
            )}
          </>
        )
      }
    >
      <div className="modale-rdv">
        <p className="modale-rdv__identite">
          {rdv.file_number && <span className="modale-rdv__dossier">{rdv.file_number}</span>}
          {ageOuNaissance(rdv) && <span>{ageOuNaissance(rdv)}</span>}
          {statut && (
            <Tampon ton={statut.ton} long={statut.long}>
              {statut.libelle}
            </Tampon>
          )}
        </p>
        <dl className="modale-rdv__details">
          {lignes.map(([terme, valeur]) => (
            <div key={terme} className="modale-rdv__ligne">
              <dt>{terme}</dt>
              <dd>{valeur}</dd>
            </div>
          ))}
        </dl>
        <ActionsStatut
          actions={actionsStatut(rdv, droits, aujourdhui())}
          enCours={enCours}
          desactive={!enLigne}
          onStatut={changer}
          onArrivee={onArrivee}
          onAnnuler={onAnnuler}
        />
        {!enLigne && (
          <Message ton="info" titre="Vous êtes hors ligne">
            <p>Le statut pourra être changé dès le retour de la connexion.</p>
          </Message>
        )}
        {echec && (
          <Message ton="erreur" titre="Statut non changé">
            <p>{echec}</p>
          </Message>
        )}
        <Button variante="discret" to={`/app/patients/${rdv.patient_id}?onglet=rendez-vous`}>
          Ouvrir le dossier du patient
        </Button>
      </div>
    </Modal>
  )
}
