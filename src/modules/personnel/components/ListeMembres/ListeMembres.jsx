import { Users } from 'lucide-react'
import Button from '../../../../components/ui/Button/Button.jsx'
import EmptyState from '../../../../components/ui/EmptyState/EmptyState.jsx'
import Tampon from '../../../../components/ui/Tampon/Tampon.jsx'
import Table from '../../../../components/ui/Table/Table.jsx'
import { formatDate, formatTelephone } from '../../../../lib/format.js'
import { libelleRole } from '../../utils.js'
import './ListeMembres.css'

// Registre du personnel : actifs d'abord, puis désactivés. La date d'arrivée et la
// personne qui a invité aident le responsable à repérer un accès inattendu.
export default function ListeMembres({ membres, chargement, moi, onGerer }) {
  const tries = [...(membres ?? [])].sort((a, b) => Number(b.is_active) - Number(a.is_active))

  const colonnes = [
    {
      cle: 'nom',
      titre: 'Nom',
      principale: true,
      rendu: (m) => (
        <span className="liste-membres__nom">
          {m.profil?.full_name || 'Nom non renseigné'}
          {m.user_id === moi && <span className="liste-membres__vous"> (vous)</span>}
          {m.profil?.title && <span className="liste-membres__titre">{m.profil.title}</span>}
        </span>
      ),
    },
    { cle: 'role', titre: 'Rôle', rendu: (m) => libelleRole(m.role) },
    {
      cle: 'telephone',
      titre: 'Téléphone',
      rendu: (m) =>
        m.profil?.phone ? (
          <span className="liste-membres__chiffres">{formatTelephone(m.profil.phone)}</span>
        ) : (
          '—'
        ),
    },
    {
      cle: 'arrivee',
      titre: 'Arrivée',
      rendu: (m) => (
        <span className="liste-membres__arrivee">
          <span className="liste-membres__chiffres">{formatDate(m.created_at)}</span>
          <span className="liste-membres__inviteur">{origine(m)}</span>
        </span>
      ),
    },
    {
      cle: 'statut',
      titre: 'Statut',
      rendu: (m) =>
        m.is_active ? (
          <Tampon ton="primaire">Actif</Tampon>
        ) : (
          <Tampon ton="neutre">Désactivé</Tampon>
        ),
    },
    {
      cle: 'action',
      titre: 'Action',
      rendu: (m) => (
        <Button
          variante="secondaire"
          onClick={() => onGerer(m)}
          aria-label={`Gérer l’accès de ${m.profil?.full_name || 'ce membre'}`}
        >
          Gérer
        </Button>
      ),
    },
  ]

  return (
    <Table
      className="liste-membres"
      legende="Membres de la structure"
      colonnes={colonnes}
      lignes={tries}
      chargement={chargement}
      vide={<EmptyState icone={Users} titre="Aucun membre" texte="Invitez votre équipe." />}
    />
  )
}

function origine(m) {
  if (m.inviteur?.full_name) return `Invité par ${m.inviteur.full_name}`
  if (m.role === 'owner' && !m.invited_by) return 'A créé la structure'
  return 'Origine non renseignée'
}
