import { useState } from 'react'
import Button from '../../../../components/ui/Button/Button.jsx'
import Field from '../../../../components/ui/Field/Field.jsx'
import Input from '../../../../components/ui/Input/Input.jsx'
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
import { chargerProchainesSeances, prendreSerie, verifierSerie } from '../../api.js'
import { useAgenda } from '../../hooks/useAgenda.js'
import { usePraticiens, useSeances, useTypesRdv } from '../../hooks/useParametresAgenda.js'
import { seancesPossibles } from '../../prise.js'
import {
  depuisPropositionSerie,
  genererDates,
  jourSuivant,
  ORDRE_CHAMPS_SERIE,
  SERIE_VIDE,
  validerSerie,
  versEnvoi,
} from '../../serie.js'
import ChampsRdv from '../ChampsRdv/ChampsRdv.jsx'
import TableSerie from '../TableSerie/TableSerie.jsx'
import './ModaleSerie.css'

const ID = 'serie-rdv'
const ID_CHAMPS = 'serie-rdv-champs'

// Série de rendez-vous (une PF tous les 3 mois…) : premier rendez-vous, nombre et
// intervalle, puis chaque date contrôlée par la base (jour férié, séance pleine) et
// déplaçable seule avant l'enregistrement, tout ou rien. Brouillon automatique (dates
// préparées comprises), jamais la note.
export default function ModaleSerie({
  orgId,
  multiPraticiens,
  medical,
  peutCreerPatient,
  patientCree,
  onFermer,
  onNouveauPatient,
  onPrise,
}) {
  const enLigne = useEnLigne()
  const types = useTypesRdv(orgId)
  const seances = useSeances(orgId)
  const praticiens = usePraticiens(orgId, multiPraticiens)
  const f = useFormulaireAccueil(`rendez-vous.serie.${orgId}`, SERIE_VIDE, { patientCree })
  const [controles, setControles] = useState(null)
  const [verification, setVerification] = useState(false)
  const [envoi, setEnvoi] = useState(false)
  const [echec, setEchec] = useState(null)
  const [note, setNote] = useState('')
  const v = f.v
  const setValeur = f.brouillon.setValeur
  const jour = v.date?.date ?? null
  const agendaJour = useAgenda(orgId, jour ?? aujourdhui(), jour ?? aujourdhui())
  const typesVisibles = (types.data ?? []).filter((t) => t.is_active)
  const seancesJour = jour
    ? seancesPossibles(
        seancesDuJour(seances.data ?? [], agendaJour.data ?? [], jour),
        v.typeId,
        v.praticienId,
      )
    : []

  // Tout changement du premier rendez-vous oublie les dates préparées.
  function maj(champ, valeur) {
    setControles(null)
    setEchec(null)
    f.maj(champ, valeur)
    if (v.dates) f.maj('dates', null)
    if (champ === 'typeId') {
      const mois = typesVisibles.find((t) => t.id === valeur)?.recurrence_months
      if (mois) f.maj('intervalle', String(mois))
    }
  }

  const champs = () => ({
    patientId: v.patient.id,
    typeId: v.typeId,
    praticienId: v.praticienId,
    note: medical ? note : '',
  })

  async function verifier(dates) {
    setVerification(true)
    setEchec(null)
    try {
      setControles(await verifierSerie(orgId, champs(), dates.map(versEnvoi)))
    } catch (e) {
      setControles(null)
      setEchec(e.message)
    } finally {
      setVerification(false)
    }
  }

  function preparer() {
    if (f.bloquer(ID, validerSerie(v, { nbSeances: seancesJour.length }), ORDRE_CHAMPS_SERIE))
      return
    const dates = genererDates(v)
    setValeur((p) => ({ ...p, dates }))
    verifier(dates)
  }

  function remplacer(dates) {
    setControles(null)
    setValeur((p) => ({ ...p, dates }))
    verifier(dates)
  }

  const bloquee = controles?.some((c) => c.blocking?.length)
  const aConfirmer = controles?.filter((c) => c.warnings?.length).length ?? 0

  async function enregistrer() {
    setEnvoi(true)
    setEchec(null)
    try {
      const liste = await prendreSerie(orgId, champs(), v.dates.map(versEnvoi), aConfirmer > 0)
      f.brouillon.effacer()
      setNote('')
      onPrise(liste)
    } catch (e) {
      setEchec(e.message)
    } finally {
      setEnvoi(false)
    }
  }

  const chargement = types.isPending || seances.isPending
  const erreurChargement = types.error ?? seances.error
  const pret = v.dates && controles && !verification

  return (
    <Modal
      ouvert
      onFermer={onFermer}
      taille="large"
      fermerSurVoile={false}
      titre="Série de rendez-vous"
      description="Chaque date est vérifiée (jours fériés, séances pleines) avant l’enregistrement."
      actions={
        v.dates ? (
          <Button chargement={envoi} disabled={!enLigne || !pret || bloquee} onClick={enregistrer}>
            {aConfirmer > 0 ? 'Confirmer et enregistrer la série' : 'Enregistrer la série'}
          </Button>
        ) : (
          <Button type="submit" form={ID_CHAMPS} disabled={!enLigne || chargement}>
            Voir les dates
          </Button>
        )
      }
    >
      <div id={ID} className="modale-serie">
        <BrouillonRetrouve brouillon={f.brouillon} onEffacer={() => f.setErreurs({})} />

        <section className="modale-serie__bloc" data-champ="patient" aria-label="Patient">
          <h3 className="modale-serie__titre">Patient</h3>
          {v.patient ? (
            <div className="modale-serie__patient">
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
          className="modale-serie__champs"
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            preparer()
          }}
        >
          {erreurChargement && (
            <Message ton="erreur">
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
            />
          )}
          <div className="modale-serie__repetition">
            <div data-champ="nombre">
              <Field
                label="Nombre de rendez-vous"
                requis
                aide="De 2 à 24."
                erreur={f.erreurs.nombre}
              >
                <Input
                  inputMode="numeric"
                  value={v.nombre}
                  onChange={(e) => maj('nombre', e.target.value)}
                />
              </Field>
            </div>
            <div data-champ="intervalle">
              <Field label="Tous les … mois" requis erreur={f.erreurs.intervalle}>
                <Input
                  inputMode="numeric"
                  value={v.intervalle}
                  onChange={(e) => maj('intervalle', e.target.value)}
                />
              </Field>
            </div>
          </div>
          {medical && (
            <Field
              label="Note"
              aide="Facultatif. Recopiée sur chaque date de la série, lue seulement par les soignants. Elle n’est pas gardée en brouillon."
            >
              <Textarea
                rows={2}
                maxLength={500}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </Field>
          )}
        </form>

        {v.dates && (
          <section className="modale-serie__bloc" aria-label="Dates de la série">
            <div className="modale-serie__entete-dates">
              <h3 className="modale-serie__titre">Dates de la série</h3>
              <Button
                variante="discret"
                chargement={verification}
                disabled={!enLigne || !v.patient}
                onClick={() => verifier(v.dates)}
              >
                Vérifier à nouveau
              </Button>
            </div>
            <TableSerie
              dates={v.dates}
              controles={controles}
              verification={verification}
              desactive={!enLigne || verification || envoi}
              chercher={(date) =>
                chargerProchainesSeances(orgId, {
                  typeId: v.typeId,
                  du: date,
                  praticienId: v.praticienId,
                })
              }
              onChanger={(i, choix) =>
                remplacer(
                  v.dates.map((d, j) =>
                    j !== i
                      ? d
                      : choix === 'suivant'
                        ? jourSuivant(d)
                        : depuisPropositionSerie(d, choix),
                  ),
                )
              }
              onRetirer={(i) => remplacer(v.dates.filter((_, j) => j !== i))}
            />
            {pret && bloquee && (
              <Message ton="erreur" titre="Série incomplète">
                <p>
                  Déplacez ou retirez les dates refusées : la série est enregistrée en entier, ou
                  pas du tout.
                </p>
              </Message>
            )}
            {pret && !bloquee && aConfirmer > 0 && (
              <Message ton="info" titre="À confirmer">
                <p>
                  {aConfirmer === 1 ? 'Une date demande' : `${aConfirmer} dates demandent`} votre
                  accord (jour férié, autre rendez-vous…). L’enregistrement vaut confirmation.
                </p>
              </Message>
            )}
          </section>
        )}

        {!enLigne && (
          <Message ton="info" titre="Vous êtes hors ligne">
            <p>La saisie est gardée sur cet appareil. Enregistrez dès le retour de la connexion.</p>
          </Message>
        )}
        {echec && (
          <Message ton="erreur" titre="Série non enregistrée">
            <p>{echec}</p>
            <p>Votre saisie est conservée sur cet appareil.</p>
          </Message>
        )}
      </div>
    </Modal>
  )
}
