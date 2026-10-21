import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import Button from '../../../../components/ui/Button/Button.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import Modal from '../../../../components/ui/Modal/Modal.jsx'
import Skeleton from '../../../../components/ui/Skeleton/Skeleton.jsx'
import Spinner from '../../../../components/ui/Spinner/Spinner.jsx'
import { useEnLigne } from '../../../../hooks/useEnLigne.js'
import { useFeature } from '../../../../hooks/useFeature.js'
import { useOrganization } from '../../../../hooks/useOrganization.js'
import { prochaineCpn, texteProchaine } from '../../../maternite/cpn.js'
import { aujourdhuiStructure } from '../../../maternite/grossesse.js'
import { useCpnConsultation, useModelesCpn } from '../../../maternite/hooks/useMaternite.js'
import { ajouterJours, aujourdhui, seancesDuJour } from '../../../rendez-vous/agenda.js'
import { chargerProchainesSeances, verifierRdv } from '../../../rendez-vous/api.js'
import ChampsRdv from '../../../rendez-vous/components/ChampsRdv/ChampsRdv.jsx'
import ControleRdv from '../../../rendez-vous/components/ControleRdv/ControleRdv.jsx'
import { useAgenda } from '../../../rendez-vous/hooks/useAgenda.js'
import { useEnvoiRdv } from '../../../rendez-vous/hooks/useEnvoiRdv.js'
import {
  usePraticiens,
  useSeances,
  useTypesRdv,
} from '../../../rendez-vous/hooks/useParametresAgenda.js'
import {
  debutRdv,
  depuisProposition,
  libelleProposition,
  messagePleine,
  ORDRE_CHAMPS_PRISE,
  PRISE_VIDE,
  seancePleine,
  seancesPossibles,
  validerRdv,
} from '../../../rendez-vous/prise.js'
import { versDateInput } from '../../../rendez-vous/utils.js'
import { prendreSuivi } from '../../api.js'
import { useTypesConsultation } from '../../hooks/useConsultation.js'
import './ModaleProchainRdv.css'

const ID = 'prochain-rdv'

// Prochain rendez-vous depuis la consultation : type, date (prochaines séances proposées),
// séance ou heure, praticien (offre Clinique). Mêmes contrôles que l'agenda (séance pleine,
// jour férié à confirmer…). Le rendez-vous suit ensuite les règles de l'agenda (type
// discret jamais nommé hors des rôles médicaux) ; l'ordonnance imprime sa date et son heure.
// Consultation prénatale : la prochaine CPN attendue (anc_status, étape 15) pré-remplit le
// type et la date ; le soignant garde la main sur tout.
export default function ModaleProchainRdv({ consultation, onFermer, onPris }) {
  const { structure } = useOrganization()
  const types = useTypesConsultation(structure.id)
  const estCpn =
    types.data?.find((t) => t.id === consultation.encounter_type_id)?.template_code === 'cpn'
  const cpn = useCpnConsultation(consultation.id, estCpn)
  const typesRdv = useTypesRdv(structure.id)
  const modeles = useModelesCpn(estCpn)
  const attente =
    types.isPending || (estCpn && (cpn.isPending || typesRdv.isPending || modeles.isPending))
  // Brouillon : la CPN en cours compte déjà (elle sera validée avant ce rendez-vous).
  const next = estCpn ? prochaineCpn(cpn.data, modeles.data, aujourdhuiStructure()) : null
  const suggestion = next
    ? {
        typeId: typesRdv.data?.find((t) => t.template_code === 'cpn' && t.is_active)?.id ?? '',
        date: next.target_date,
        texte: texteProchaine(next),
      }
    : null
  // La fenêtre attend la suggestion (champs en squelette) : son état part de la suggestion.
  return (
    <FenetreProchainRdv
      key={attente ? 'attente' : 'prete'}
      consultation={consultation}
      suggestion={suggestion}
      attente={attente}
      onFermer={onFermer}
      onPris={onPris}
    />
  )
}

function FenetreProchainRdv({ consultation, suggestion, attente, onFermer, onPris }) {
  const { structure } = useOrganization()
  const orgId = structure.id
  const enLigne = useEnLigne()
  const multiPraticiens = useFeature('agenda_multi_praticiens').actif
  const types = useTypesRdv(orgId)
  const seances = useSeances(orgId)
  const praticiens = usePraticiens(orgId, multiPraticiens)
  const envoi = useEnvoiRdv()
  const [v, setV] = useState(() => ({
    ...PRISE_VIDE,
    patient: { id: consultation.patient_id },
    ...(suggestion?.typeId
      ? { typeId: suggestion.typeId, date: versDateInput(suggestion.date) }
      : {}),
  }))
  const [erreurs, setErreurs] = useState({})
  const jour = v.date?.date ?? null
  const agendaJour = useAgenda(orgId, jour ?? aujourdhui(), jour ?? aujourdhui())
  const demain = ajouterJours(aujourdhui(), 1)
  // Prochaine CPN : séances proposées à partir de la date attendue.
  const du =
    suggestion?.typeId && v.typeId === suggestion.typeId && suggestion.date > demain
      ? suggestion.date
      : demain
  const propositions = useQuery({
    queryKey: ['consultations', 'prochaines-seances', orgId, v.typeId, v.praticienId, du],
    queryFn: () =>
      chargerProchainesSeances(orgId, { typeId: v.typeId, du, praticienId: v.praticienId }),
    enabled: Boolean(v.typeId),
    staleTime: 30 * 1000,
  })

  const seancesJour = jour
    ? seancesPossibles(
        seancesDuJour(seances.data ?? [], agendaJour.data ?? [], jour),
        v.typeId,
        v.praticienId,
      )
    : []

  function maj(champ, valeur) {
    envoi.reinitialiser()
    setV((p) => ({ ...p, [champ]: valeur }))
    setErreurs((e) => ({ ...e, [champ]: undefined }))
  }

  function champs() {
    return {
      patientId: consultation.patient_id,
      typeId: v.typeId,
      praticienId: v.praticienId,
      seanceId: v.seanceId,
      horsSeance: !v.seanceId && !!v.horsSeance,
      debut: debutRdv(v.date.date, v.heure),
    }
  }

  const chercher = () =>
    chargerProchainesSeances(orgId, { typeId: v.typeId, du: jour, praticienId: v.praticienId })

  async function envoyer(confirmer = false) {
    const trouvees = validerRdv(v, { nbSeances: seancesJour.length })
    setErreurs(trouvees)
    if (Object.keys(trouvees).length) {
      const premier = ORDRE_CHAMPS_PRISE.find((c) => trouvees[c])
      document
        .querySelector(
          `#${ID} [data-champ='${premier}'] input, #${ID} [data-champ='${premier}'] select`,
        )
        ?.focus()
      return
    }
    const c = champs()
    const ok = await envoi.envoyer({
      confirmer,
      verifier: () => verifierRdv(orgId, c),
      enregistrer: (conf) => prendreSuivi(consultation.id, c, conf),
      chercher,
    })
    if (ok) onPris(ok.resultat)
  }

  const chargement = attente || types.isPending || seances.isPending
  const erreurChargement = types.error ?? seances.error
  const liste = (types.data ?? []).filter((t) => t.is_active)

  return (
    <Modal
      ouvert
      onFermer={onFermer}
      taille="large"
      fermerSurVoile={false}
      titre="Prochain rendez-vous"
      description="Il s’inscrit dans l’agenda. L’ordonnance imprimée en donne la date et l’heure, jamais le type."
      actions={
        <Button
          type="submit"
          form={`${ID}-form`}
          chargement={envoi.envoi}
          disabled={!enLigne || chargement}
        >
          Enregistrer le rendez-vous
        </Button>
      }
    >
      <div id={ID} className="modale-prochain-rdv">
        <form
          id={`${ID}-form`}
          className="modale-prochain-rdv__champs"
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
          {suggestion && !chargement && (
            <Message ton="info" titre="Prochaine CPN">
              <p>{suggestion.texte}</p>
            </Message>
          )}
          {chargement && !erreurChargement && <Skeleton forme="bloc" hauteur="8rem" />}
          {!chargement && !erreurChargement && (
            <ChampsRdv
              id={ID}
              saisie={v}
              erreurs={erreurs}
              maj={maj}
              types={liste}
              praticiens={multiPraticiens ? (praticiens.data ?? []) : null}
              seances={seancesJour}
              onSeance={(s) => {
                if (seancePleine(s)) envoi.signalerPleine(messagePleine(s, jour), chercher)
              }}
            />
          )}
        </form>

        {v.typeId && (
          <section className="modale-prochain-rdv__propositions" aria-label="Prochaines séances">
            <h3 className="modale-prochain-rdv__titre">Prochaines séances avec des places</h3>
            {propositions.isPending && <Spinner libelle="Recherche des prochaines séances…" />}
            {propositions.error && <p>{propositions.error.message}</p>}
            {propositions.data?.length === 0 && (
              <p className="modale-prochain-rdv__vide">
                Aucune séance prévue pour ce type : choisissez la date et l’heure.
              </p>
            )}
            {propositions.data?.length > 0 && (
              <ul className="modale-prochain-rdv__liste">
                {propositions.data.map((p) => (
                  <li key={`${p.local_date}-${p.start_time}`}>
                    <Button
                      variante="secondaire"
                      onClick={() => {
                        envoi.reinitialiser()
                        setV((s) => ({ ...s, ...depuisProposition(p) }))
                        setErreurs({})
                      }}
                    >
                      {libelleProposition(p)}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        <ControleRdv
          controle={envoi.controle}
          propositions={envoi.propositions}
          envoi={envoi.envoi}
          desactive={!enLigne}
          onChoisir={(p) => {
            envoi.reinitialiser()
            setV((s) => ({ ...s, ...depuisProposition(p) }))
          }}
          onConfirmer={() => envoyer(true)}
        />
        {!enLigne && (
          <Message ton="info" titre="Vous êtes hors ligne">
            <p>Enregistrez le rendez-vous dès le retour de la connexion.</p>
          </Message>
        )}
        {envoi.echec && (
          <Message ton="erreur" titre="Rendez-vous non enregistré">
            <p>{envoi.echec}</p>
          </Message>
        )}
      </div>
    </Modal>
  )
}
