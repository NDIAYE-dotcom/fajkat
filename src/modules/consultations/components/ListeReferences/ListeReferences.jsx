import { Send } from 'lucide-react'
import Button from '../../../../components/ui/Button/Button.jsx'
import EmptyState from '../../../../components/ui/EmptyState/EmptyState.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import Table from '../../../../components/ui/Table/Table.jsx'
import Tampon from '../../../../components/ui/Tampon/Tampon.jsx'
import { formatDate } from '../../../../lib/format.js'
import { nomComplet } from '../../../patients/utils.js'
import { attenteReference } from '../../documents.js'
import './ListeReferences.css'

// « contre-référence » ne passe jamais à la ligne à son trait d'union.
export function ContreReference({ pluriel = false }) {
  return <span className="liste-references__mot">{`contre-référence${pluriel ? 's' : ''}`}</span>
}

const nom = (r) => nomComplet({ last_name: r.patient_last_name, first_name: r.patient_first_name })

// Références d'un statut (en attente de retour, ou revenues), façon registre. Consultation
// sensible : ni motif ni urgence (la base ne les donne pas), « Pli confidentiel ».
//   onOuvrir(r) : fiche (contre-référence) ; onImprimer(r) : réimprimer la lettre.
export default function ListeReferences({ statut, requete, onOuvrir, onImprimer }) {
  const attente = statut === 'pending'
  const colonnes = [
    {
      cle: 'patient',
      titre: 'Patient',
      principale: true,
      rendu: (r) => (
        <span className="liste-references__pile">
          <span>{nom(r)}</span>
          <span className="liste-references__chiffres">{r.file_number}</span>
        </span>
      ),
    },
    {
      cle: 'referred_at',
      titre: 'Référé le',
      rendu: (r) => <span className="liste-references__chiffres">{formatDate(r.referred_at)}</span>,
    },
    { cle: 'destination_name', titre: 'Destination' },
    {
      cle: 'reason',
      titre: 'Motif',
      rendu: (r) =>
        r.is_sensitive ? (
          <Tampon ton="encre" long>
            Pli confidentiel
          </Tampon>
        ) : (
          <span className="liste-references__pile">
            <span className="liste-references__motif">{r.reason}</span>
            {r.urgency === 'urgent' && <Tampon statut="urgent" />}
          </span>
        ),
    },
    attente
      ? {
          cle: 'days_waiting',
          titre: 'Attente',
          rendu: (r) => (
            <span className="liste-references__pile">
              <span>{attenteReference(r)}</span>
              {r.is_late && (
                <Tampon ton="alerte" long>
                  En retard
                </Tampon>
              )}
            </span>
          ),
        }
      : {
          cle: 'counter_received_on',
          titre: 'Retour du',
          rendu: (r) => (
            <span className="liste-references__chiffres">{formatDate(r.counter_received_on)}</span>
          ),
        },
    {
      cle: 'actions',
      titre: 'Actions',
      rendu: (r) => (
        <span className="liste-references__actions">
          <Button variante={attente ? 'primaire' : 'secondaire'} onClick={() => onOuvrir(r)}>
            {attente ? 'Saisir la ' : 'Voir la '}
            <ContreReference />
          </Button>
          <Button variante="discret" onClick={() => onImprimer(r)}>
            Réimprimer la lettre
          </Button>
          <Button variante="discret" to={`/app/consultations/${r.encounter_id}`}>
            Consultation
          </Button>
        </span>
      ),
    },
  ]

  if (requete.error) {
    return (
      <Message ton="erreur" action={<Button onClick={() => requete.refetch()}>Réessayer</Button>}>
        <p>{requete.error.message}</p>
      </Message>
    )
  }
  return (
    <Table
      className="liste-references"
      colonnes={colonnes}
      lignes={requete.data ?? []}
      chargement={requete.isPending}
      legende={attente ? 'Références en attente de retour' : 'Retours reçus'}
      vide={
        <EmptyState
          icone={Send}
          titre={attente ? 'Aucune référence en attente' : 'Aucun retour reçu'}
          texte={
            attente
              ? 'Les patients référés depuis une consultation s’affichent ici jusqu’au retour du coupon.'
              : 'Les retours saisis s’affichent ici, le plus récent en haut.'
          }
        />
      }
    />
  )
}
