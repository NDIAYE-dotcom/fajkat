import { MailOpen, Send } from 'lucide-react'
import { useState } from 'react'
import Button from '../../../../components/ui/Button/Button.jsx'
import EmptyState from '../../../../components/ui/EmptyState/EmptyState.jsx'
import Icone from '../../../../components/ui/Icone/Icone.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import Modal from '../../../../components/ui/Modal/Modal.jsx'
import Panel from '../../../../components/ui/Panel/Panel.jsx'
import Tampon from '../../../../components/ui/Tampon/Tampon.jsx'
import Table from '../../../../components/ui/Table/Table.jsx'
import { useToast } from '../../../../hooks/useToast.js'
import { formatDate, formatTelephone } from '../../../../lib/format.js'
import { annulerInvitation, creerInvitation, renouvelerInvitation } from '../../api.js'
import { LIBELLES_CANAL, libelleRole, STATUTS_INVITATION, statutInvitation } from '../../utils.js'
import './OngletInvitations.css'

// Invitations : d'abord l'équipe notée pendant le démarrage (un clic pour l'inviter),
// puis le registre des invitations envoyées. onLien(envoi) ouvre l'écran du lien.
export default function OngletInvitations({
  structure,
  aEnvoyer,
  invitations,
  chargement,
  onLien,
  onChange,
}) {
  const toast = useToast()
  const [enCours, setEnCours] = useState(null)
  const [erreur, setErreur] = useState(null)
  const [aAnnuler, setAAnnuler] = useState(null)

  async function agir(id, action) {
    setEnCours(id)
    setErreur(null)
    try {
      await action()
    } catch (e) {
      setErreur(e)
    } finally {
      setEnCours(null)
    }
  }

  const inviterNote = (p) =>
    agir(p.id, async () => {
      const r = await creerInvitation(structure.id, { pendingId: p.id })
      onLien({ invitationId: r.invitation_id, jeton: r.token, expireLe: r.expires_at, personne: p })
      onChange()
    })

  const nouveauLien = (inv) =>
    agir(inv.id, async () => {
      const r = await renouvelerInvitation(inv.id)
      onLien({
        invitationId: r.invitation_id,
        jeton: r.token,
        expireLe: r.expires_at,
        personne: inv,
      })
      onChange()
    })

  async function confirmerAnnulation() {
    const inv = aAnnuler
    setAAnnuler(null)
    await agir(inv.id, async () => {
      await annulerInvitation(inv.id)
      toast.succes(`Invitation de ${inv.full_name} annulée`)
      onChange()
    })
  }

  const colonnes = [
    {
      cle: 'nom',
      titre: 'Personne',
      principale: true,
      rendu: (i) => (
        <span className="onglet-invitations__personne">
          {i.full_name}
          <span className="onglet-invitations__contact">
            {[i.phone && formatTelephone(i.phone), i.email].filter(Boolean).join(' · ')}
          </span>
        </span>
      ),
    },
    { cle: 'role', titre: 'Rôle', rendu: (i) => libelleRole(i.role) },
    { cle: 'canal', titre: 'Envoi', rendu: (i) => LIBELLES_CANAL[i.channel] ?? i.channel },
    {
      cle: 'date',
      titre: 'Date',
      rendu: (i) => (
        <span>
          {i.status === 'accepted' ? 'Acceptée le ' : 'Jusqu’au '}
          <span className="onglet-invitations__chiffres">
            {formatDate(i.status === 'accepted' ? i.accepted_at : i.expires_at)}
          </span>
        </span>
      ),
    },
    {
      cle: 'statut',
      titre: 'Statut',
      rendu: (i) => {
        const s = STATUTS_INVITATION[statutInvitation(i)]
        return <Tampon ton={s.ton}>{s.libelle}</Tampon>
      },
    },
    {
      cle: 'actions',
      titre: 'Actions',
      rendu: (i) =>
        i.status === 'pending' && (
          <span className="onglet-invitations__actions">
            <Button
              variante="secondaire"
              chargement={enCours === i.id}
              onClick={() => nouveauLien(i)}
              aria-label={`Nouveau lien pour ${i.full_name}`}
            >
              Nouveau lien
            </Button>
            <Button
              variante="discret"
              disabled={enCours === i.id}
              onClick={() => setAAnnuler(i)}
              aria-label={`Annuler l’invitation de ${i.full_name}`}
            >
              Annuler
            </Button>
          </span>
        ),
    },
  ]

  return (
    <div className="onglet-invitations">
      {erreur && (
        <Message ton="erreur" titre="Action non effectuée">
          <p>{erreur.message}</p>
        </Message>
      )}

      {aEnvoyer?.length > 0 && (
        <Panel
          marque
          titre="Équipe notée au démarrage"
          sousTitre="Ces personnes n’ont pas encore reçu leur lien."
        >
          <ul className="onglet-invitations__liste">
            {aEnvoyer.map((p) => (
              <li key={p.id} className="onglet-invitations__note">
                <span className="onglet-invitations__personne">
                  {p.full_name}
                  <span className="onglet-invitations__contact">
                    {libelleRole(p.role)}
                    {p.phone ? ` · ${formatTelephone(p.phone)}` : ''}
                    {p.email ? ` · ${p.email}` : ''}
                  </span>
                </span>
                <Button
                  iconeDebut={<Icone icone={Send} />}
                  chargement={enCours === p.id}
                  onClick={() => inviterNote(p)}
                  aria-label={`Inviter ${p.full_name}`}
                >
                  Inviter
                </Button>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Table
        legende="Invitations envoyées"
        legendeVisible
        colonnes={colonnes}
        lignes={invitations ?? []}
        chargement={chargement}
        vide={
          <EmptyState
            icone={MailOpen}
            titre="Aucune invitation envoyée"
            texte="Invitez un membre : il recevra un lien personnel sur WhatsApp."
          />
        }
      />

      <Modal
        ouvert={Boolean(aAnnuler)}
        onFermer={() => setAAnnuler(null)}
        titre="Annuler l’invitation ?"
        description={aAnnuler ? `Le lien envoyé à ${aAnnuler.full_name} ne fonctionnera plus.` : ''}
        actions={
          <>
            <Button variante="secondaire" onClick={() => setAAnnuler(null)}>
              Garder
            </Button>
            <Button onClick={confirmerAnnulation}>Annuler l’invitation</Button>
          </>
        }
      />
    </div>
  )
}
