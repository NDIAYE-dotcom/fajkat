import { CalendarClock } from 'lucide-react'
import Button from '../../../../components/ui/Button/Button.jsx'
import EmptyState from '../../../../components/ui/EmptyState/EmptyState.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import Skeleton from '../../../../components/ui/Skeleton/Skeleton.jsx'
import Tampon from '../../../../components/ui/Tampon/Tampon.jsx'
import { formatHeure } from '../../../../lib/format.js'
import { aujourdhui, statutRdv } from '../../../rendez-vous/agenda.js'
import { useRdvPatient, useStatsPatient } from '../../../rendez-vous/hooks/useAgenda.js'
import { resumeAbsences, separerRdvPatient } from '../../../rendez-vous/suivi.js'
import { dateFr } from '../../../rendez-vous/utils.js'
import './OngletRendezVous.css'

// Rendez-vous du patient : à venir et passés, avec son taux d'absence. Les types discrets
// arrivent de la base sous « Consultation » pour l'accueil et le caissier, sans série,
// ni motif, ni note, comme dans l'agenda.
export default function OngletRendezVous({ patient }) {
  const liste = useRdvPatient(patient.id, true, patient.org_id)
  // Taux d’absence lu après la liste : les rendez-vous des jours finis sont alors clos.
  const stats = useStatsPatient(patient.id, liste.isSuccess)
  const erreur = liste.error ?? stats.error

  if (erreur) {
    return (
      <Message
        ton="erreur"
        action={
          <Button
            onClick={() => {
              liste.refetch()
              stats.refetch()
            }}
          >
            Réessayer
          </Button>
        }
      >
        <p>{erreur.message}</p>
      </Message>
    )
  }
  if (liste.isPending || stats.isPending) return <Skeleton forme="bloc" hauteur="10rem" />

  const { aVenir, passes } = separerRdvPatient(liste.data, aujourdhui())
  const absences = resumeAbsences(stats.data)

  if (liste.data.length === 0) {
    return (
      <EmptyState
        icone={CalendarClock}
        titre="Aucun rendez-vous"
        texte="Les rendez-vous pris dans l’agenda pour ce patient apparaîtront ici."
        action={<Button to="/app/rendez-vous">Ouvrir l’agenda</Button>}
      />
    )
  }

  return (
    <div className="onglet-rdv">
      <p className="onglet-rdv__bilan">
        {absences ? (
          <>
            <span>{absences.texte}</span>
            <strong className="onglet-rdv__taux">Taux d’absence : {absences.taux} %</strong>
          </>
        ) : (
          <span>Aucun rendez-vous passé : pas encore de taux d’absence.</span>
        )}
      </p>
      <Section titre="À venir" liste={aVenir} vide="Aucun rendez-vous à venir." />
      <Section titre="Passés" liste={passes} vide="Aucun rendez-vous passé." />
    </div>
  )
}

function Section({ titre, liste, vide }) {
  return (
    <section className="onglet-rdv__section" aria-label={titre}>
      <h3 className="onglet-rdv__titre">
        {titre} <span className="onglet-rdv__nombre">({liste.length})</span>
      </h3>
      {liste.length === 0 ? (
        <p className="onglet-rdv__vide">{vide}</p>
      ) : (
        <ul className="onglet-rdv__liste">
          {liste.map((r) => (
            <LigneRdvPatient key={r.id} rdv={r} />
          ))}
        </ul>
      )}
    </section>
  )
}

function LigneRdvPatient({ rdv }) {
  const statut = statutRdv(rdv)
  const details = [
    rdv.practitioner_name,
    rdv.series_index && `Série, n° ${rdv.series_index}`,
    rdv.ticket_number && `Ticket ${rdv.ticket_number}`,
    rdv.cancel_reason && `Motif : ${rdv.cancel_reason}`,
  ].filter(Boolean)

  return (
    <li className="onglet-rdv__ligne">
      <div className="onglet-rdv__quand">
        <span className="onglet-rdv__date">{dateFr(rdv.local_date)}</span>
        <span className="onglet-rdv__heure">{formatHeure(rdv.starts_at)}</span>
      </div>
      <div className="onglet-rdv__quoi">
        <p className="onglet-rdv__type">
          <span>{rdv.type_label ?? 'Consultation'}</span>
          {statut && (
            <Tampon ton={statut.ton} long={statut.long}>
              {statut.libelle}
            </Tampon>
          )}
        </p>
        {details.length > 0 && <p className="onglet-rdv__details">{details.join(' · ')}</p>}
        {rdv.note && <p className="onglet-rdv__note">Note : {rdv.note}</p>}
      </div>
      <Button
        variante="discret"
        className="onglet-rdv__lien"
        to={`/app/rendez-vous?date=${rdv.local_date}`}
      >
        Voir dans l’agenda
      </Button>
    </li>
  )
}
