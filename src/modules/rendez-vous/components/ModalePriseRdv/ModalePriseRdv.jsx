import { useEffect, useState } from 'react'
import Button from '../../../../components/ui/Button/Button.jsx'
import Field from '../../../../components/ui/Field/Field.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import Modal from '../../../../components/ui/Modal/Modal.jsx'
import Skeleton from '../../../../components/ui/Skeleton/Skeleton.jsx'
import Textarea from '../../../../components/ui/Textarea/Textarea.jsx'
import { useEnLigne } from '../../../../hooks/useEnLigne.js'
import BrouillonRetrouve from '../../../accueil/components/BrouillonRetrouve/BrouillonRetrouve.jsx'
import ChoixPatient from '../../../accueil/components/ChoixPatient/ChoixPatient.jsx'
import { useFormulaireAccueil } from '../../../accueil/hooks/useFormulaireAccueil.js'
import { resumePatient } from '../../../accueil/utils.js'
import LignePatient from '../../../patients/components/LignePatient/LignePatient.jsx'
import { aujourdhui, seancesDuJour } from '../../agenda.js'
import { chargerProchainesSeances, prendreRdv, verifierRdv } from '../../api.js'
import { useAgenda } from '../../hooks/useAgenda.js'
import { useEnvoiRdv } from '../../hooks/useEnvoiRdv.js'
import { usePraticiens, useSeances, useTypesRdv } from '../../hooks/useParametresAgenda.js'
import {
  debutRdv,
  depuisProposition,
  messagePleine,
  ORDRE_CHAMPS_PRISE,
  PRISE_VIDE,
  seancePleine,
  seancesPossibles,
  validerRdv,
} from '../../prise.js'
import ChampsRdv from '../ChampsRdv/ChampsRdv.jsx'
import ControleRdv from '../ControleRdv/ControleRdv.jsx'
import './ModalePriseRdv.css'

const ID = 'prise-rdv'
// La recherche du patient est elle-même un formulaire : elle reste hors du <form> des champs.
const ID_CHAMPS = 'prise-rdv-champs'
const NOTE_MAX = 500

// Prise d'un rendez-vous : patient (recherche ou création rapide), type, date, séance ou
// heure. La base contrôle avant l'enregistrement (séance pleine : prochaines séances
// proposées ; jour férié : à confirmer). Brouillon automatique, propre à l'utilisateur et
// à la structure, effacé à la déconnexion ; la note (soignants) n'y est jamais gardée.
// Types proposés : ceux que l'utilisateur voit (l'accueil ne voit aucun type discret).
export default function ModalePriseRdv({
  orgId,
  multiPraticiens,
  medical,
  peutCreerPatient,
  patientCree,
  onFermer,
  onNouveauPatient,
  onPris,
}) {
  const enLigne = useEnLigne()
  const types = useTypesRdv(orgId)
  const seances = useSeances(orgId)
  const praticiens = usePraticiens(orgId, multiPraticiens)
  const f = useFormulaireAccueil(`rendez-vous.prise.${orgId}`, PRISE_VIDE, { patientCree })
  const envoi = useEnvoiRdv()
  const [note, setNote] = useState('')
  const v = f.v
  const jour = v.date?.date ?? null
  const agendaJour = useAgenda(orgId, jour ?? aujourdhui(), jour ?? aujourdhui())

  const typesVisibles = (types.data ?? []).filter((t) => t.is_active)
  const setValeur = f.brouillon.setValeur
  // Brouillon retrouvé avec un type que l'utilisateur ne voit pas (ou plus) : oublié.
  useEffect(() => {
    if (types.data && v.typeId && !types.data.some((t) => t.id === v.typeId && t.is_active)) {
      setValeur((p) => ({ ...p, typeId: '', seanceId: '' }))
    }
  }, [types.data, v.typeId, setValeur])

  const seancesJour = jour
    ? seancesPossibles(
        seancesDuJour(seances.data ?? [], agendaJour.data ?? [], jour),
        v.typeId,
        v.praticienId,
      )
    : []

  function maj(champ, valeur) {
    envoi.reinitialiser()
    f.maj(champ, valeur)
  }

  function champs() {
    return {
      patientId: v.patient.id,
      typeId: v.typeId,
      praticienId: v.praticienId,
      seanceId: v.seanceId,
      // Hors séance volontaire : pendant une séance pleine du même type, la base demande
      // une confirmation (« La séance de 09:00 est pleine : prendre quand même… »).
      horsSeance: !v.seanceId && !!v.horsSeance,
      debut: debutRdv(v.date.date, v.heure),
      note: medical ? note : '',
    }
  }

  const chercher = () =>
    chargerProchainesSeances(orgId, { typeId: v.typeId, du: jour, praticienId: v.praticienId })

  // Séance pleine choisie : « Séance pleine » et les prochaines séances, sans attendre l'envoi.
  function choisirSeance(s) {
    if (seancePleine(s)) envoi.signalerPleine(messagePleine(s, jour), chercher)
  }

  async function envoyer(confirmer = false) {
    if (f.bloquer(ID, validerRdv(v, { nbSeances: seancesJour.length }), ORDRE_CHAMPS_PRISE)) return
    const c = champs()
    const ok = await envoi.envoyer({
      confirmer,
      verifier: () => verifierRdv(orgId, c),
      enregistrer: (conf) => prendreRdv(orgId, c, conf),
      chercher,
    })
    if (ok) {
      f.brouillon.effacer()
      setNote('')
      onPris(ok.resultat)
    }
  }

  const chargement = types.isPending || seances.isPending
  const erreurChargement = types.error ?? seances.error

  return (
    <Modal
      ouvert
      onFermer={onFermer}
      taille="large"
      fermerSurVoile={false}
      titre="Nouveau rendez-vous"
      description="La base vérifie la séance, les places et les jours fériés avant d’enregistrer."
      actions={
        <Button
          type="submit"
          form={ID_CHAMPS}
          chargement={envoi.envoi}
          disabled={!enLigne || chargement}
        >
          Enregistrer le rendez-vous
        </Button>
      }
    >
      <div id={ID} className="modale-prise-rdv">
        <BrouillonRetrouve brouillon={f.brouillon} onEffacer={() => f.setErreurs({})} />

        <section className="modale-prise-rdv__bloc" data-champ="patient" aria-label="Patient">
          <h3 className="modale-prise-rdv__titre">Patient</h3>
          {v.patient ? (
            <div className="modale-prise-rdv__patient">
              <LignePatient patient={v.patient} />
              <Button variante="discret" onClick={() => maj('patient', null)}>
                Changer de patient
              </Button>
            </div>
          ) : (
            <ChoixPatient
              orgId={orgId}
              peutCreer={peutCreerPatient}
              erreur={f.erreurs.patient}
              onChoisir={(p) => maj('patient', resumePatient(p))}
              onNouveau={onNouveauPatient}
            />
          )}
        </section>

        <form
          id={ID_CHAMPS}
          className="modale-prise-rdv__champs"
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            envoyer()
          }}
        >
          {erreurChargement && (
            <Message
              ton="erreur"
              action={
                <Button
                  onClick={() => {
                    types.refetch()
                    seances.refetch()
                  }}
                >
                  Réessayer
                </Button>
              }
            >
              <p>{erreurChargement.message}</p>
            </Message>
          )}
          {chargement && !erreurChargement && <Skeleton forme="bloc" hauteur="8rem" />}
          {!chargement && !erreurChargement && (
            <ChampsRdv
              id={ID}
              saisie={v}
              erreurs={f.erreurs}
              maj={maj}
              types={typesVisibles}
              praticiens={multiPraticiens ? (praticiens.data ?? []) : null}
              seances={seancesJour}
              onSeance={choisirSeance}
            />
          )}

          {medical && (
            <Field
              label="Note"
              aide="Facultatif. Lue seulement par les soignants. Elle n’est pas gardée en brouillon sur l’appareil."
            >
              <Textarea
                rows={2}
                maxLength={NOTE_MAX}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </Field>
          )}
        </form>
        <ControleRdv
          controle={envoi.controle}
          propositions={envoi.propositions}
          envoi={envoi.envoi}
          desactive={!enLigne}
          onChoisir={(p) => {
            envoi.reinitialiser()
            setValeur((s) => ({ ...s, ...depuisProposition(p) }))
          }}
          onConfirmer={() => envoyer(true)}
        />
        {!enLigne && (
          <Message ton="info" titre="Vous êtes hors ligne">
            <p>La saisie est gardée sur cet appareil. Enregistrez dès le retour de la connexion.</p>
          </Message>
        )}
        {envoi.echec && (
          <Message ton="erreur" titre="Rendez-vous non enregistré">
            <p>{envoi.echec}</p>
            <p>Votre saisie est conservée sur cet appareil.</p>
          </Message>
        )}
      </div>
    </Modal>
  )
}
