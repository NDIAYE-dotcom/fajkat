import { useQuery } from '@tanstack/react-query'
import Button from '../../../../components/ui/Button/Button.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import Modal from '../../../../components/ui/Modal/Modal.jsx'
import { useEnLigne } from '../../../../hooks/useEnLigne.js'
import { formatHeure } from '../../../../lib/format.js'
import BrouillonRetrouve from '../../../accueil/components/BrouillonRetrouve/BrouillonRetrouve.jsx'
import { useFormulaireAccueil } from '../../../accueil/hooks/useFormulaireAccueil.js'
import { nomComplet } from '../../../patients/utils.js'
import { aujourdhui } from '../../agenda.js'
import { chargerProchainesSeances, reporterUnRdv, verifierRdv } from '../../api.js'
import { useEnvoiRdv } from '../../hooks/useEnvoiRdv.js'
import { usePraticiens } from '../../hooks/useParametresAgenda.js'
import {
  debutRdv,
  depuisProposition,
  libelleProposition,
  ORDRE_CHAMPS_PRISE,
  validerRdv,
} from '../../prise.js'
import { dateLongue, versDateInput } from '../../utils.js'
import ChampsRdv from '../ChampsRdv/ChampsRdv.jsx'
import ControleRdv from '../ControleRdv/ControleRdv.jsx'
import './ModaleReporterRdv.css'

const ID = 'report-rdv'

// Report d'un rendez-vous : nouvelle date, heure (et praticien en clinique). Le type ne
// change pas : la base garde celui du rendez-vous, même quand l'accueil ne voit qu'un
// libellé neutre ; elle retrouve aussi la séance de ce type. Les prochaines séances qui ont
// des places sont proposées d'office (date, heure et places seulement). Brouillon
// automatique ; l'ancien rendez-vous reste, au statut « Reporté ».
export default function ModaleReporterRdv({ orgId, rdv, multiPraticiens, onFermer, onReporte }) {
  const enLigne = useEnLigne()
  const praticiens = usePraticiens(orgId, multiPraticiens)
  const praticienActuel = rdv.practitioner_membership_id ?? ''
  const f = useFormulaireAccueil(`rendez-vous.report.${rdv.id}`, {
    date: versDateInput(null),
    seanceId: '',
    heure: formatHeure(rdv.starts_at),
    praticienId: praticienActuel,
  })
  const envoi = useEnvoiRdv()
  const v = f.v
  const propositions = useQuery({
    queryKey: ['rendez-vous', 'propositions', rdv.id, v.praticienId],
    queryFn: () =>
      chargerProchainesSeances(orgId, {
        rdvId: rdv.id,
        du: aujourdhui(),
        praticienId: v.praticienId,
      }),
    enabled: enLigne,
    staleTime: 30 * 1000,
  })

  function maj(champ, valeur) {
    envoi.reinitialiser()
    f.maj(champ, valeur)
  }

  // Séance proposée : date et heure ; la séance elle-même est retrouvée par la base.
  function choisir(p) {
    envoi.reinitialiser()
    f.brouillon.setValeur((s) => ({ ...s, ...depuisProposition(p), seanceId: '' }))
    f.setErreurs({})
  }

  async function envoyer(confirmer = false) {
    const erreurs = validerRdv(v, { avecPatient: false, avecType: false })
    if (f.bloquer(ID, erreurs, ORDRE_CHAMPS_PRISE)) return
    const debut = debutRdv(v.date.date, v.heure)
    const ok = await envoi.envoyer({
      confirmer,
      verifier: () =>
        verifierRdv(orgId, {
          patientId: rdv.patient_id,
          typeId: rdv.appointment_type_id,
          debut,
          praticienId: v.praticienId,
          rdvId: rdv.id,
        }),
      enregistrer: (conf) =>
        reporterUnRdv(
          rdv.id,
          { debut, praticienId: v.praticienId, garderPraticien: v.praticienId === praticienActuel },
          conf,
        ),
      chercher: () =>
        chargerProchainesSeances(orgId, {
          rdvId: rdv.id,
          du: v.date.date,
          praticienId: v.praticienId,
        }),
    })
    if (ok) {
      f.brouillon.effacer()
      onReporte(ok.resultat)
    }
  }

  const liste = propositions.data ?? []
  const nom = nomComplet({ last_name: rdv.patient_last_name, first_name: rdv.patient_first_name })

  return (
    <Modal
      ouvert
      onFermer={onFermer}
      fermerSurVoile={false}
      titre="Reporter le rendez-vous"
      description={`${nom} — prévu ${dateLongue(rdv.local_date)} à ${formatHeure(rdv.starts_at)}.`}
      actions={
        <Button type="submit" form={ID} chargement={envoi.envoi} disabled={!enLigne}>
          Reporter
        </Button>
      }
    >
      <form
        id={ID}
        className="modale-reporter-rdv"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          envoyer()
        }}
      >
        <BrouillonRetrouve brouillon={f.brouillon} onEffacer={() => f.setErreurs({})} />
        {liste.length > 0 && (
          <section className="modale-reporter-rdv__propositions" aria-label="Prochaines séances">
            <h3 className="modale-reporter-rdv__titre">Prochaines séances avec des places</h3>
            <ul className="modale-reporter-rdv__liste">
              {liste.map((p) => (
                <li key={`${p.local_date}-${p.start_time}`}>
                  <Button
                    variante="secondaire"
                    className="modale-reporter-rdv__choix"
                    onClick={() => choisir(p)}
                  >
                    {libelleProposition(p)}
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        )}
        <ChampsRdv
          id={ID}
          saisie={v}
          erreurs={f.erreurs}
          maj={maj}
          types={null}
          praticiens={multiPraticiens ? (praticiens.data ?? []) : null}
          seances={[]}
        />
        <ControleRdv
          controle={envoi.controle}
          propositions={envoi.propositions}
          envoi={envoi.envoi}
          desactive={!enLigne}
          onChoisir={choisir}
          onConfirmer={() => envoyer(true)}
        />
        {!enLigne && (
          <Message ton="info" titre="Vous êtes hors ligne">
            <p>La saisie est gardée sur cet appareil. Reportez dès le retour de la connexion.</p>
          </Message>
        )}
        {envoi.echec && (
          <Message ton="erreur" titre="Rendez-vous non reporté">
            <p>{envoi.echec}</p>
            <p>Votre saisie est conservée sur cet appareil.</p>
          </Message>
        )}
      </form>
    </Modal>
  )
}
