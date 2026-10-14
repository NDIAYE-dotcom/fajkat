import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Clock } from 'lucide-react'
import { useState } from 'react'
import Button from '../../../../components/ui/Button/Button.jsx'
import EmptyState from '../../../../components/ui/EmptyState/EmptyState.jsx'
import Icone from '../../../../components/ui/Icone/Icone.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import Spinner from '../../../../components/ui/Spinner/Spinner.jsx'
import Table from '../../../../components/ui/Table/Table.jsx'
import Tampon from '../../../../components/ui/Tampon/Tampon.jsx'
import { formatHeure } from '../../../../lib/format.js'
import {
  chargerAffectations,
  chargerAujourdhui,
  chargerCreneaux,
  chargerMembres,
  chargerPresencesDuJour,
  cles,
} from '../../api.js'
import {
  decalerJours,
  dureeEntre,
  libelleJour,
  libelleRole,
  nomMembre,
  statutPresence,
} from '../../utils.js'
import ModaleCorrection from '../ModaleCorrection/ModaleCorrection.jsx'
import './PresencesDuJour.css'

// Présences d'un jour (owner et admin) : pointages, membres prévus au planning, absents.
// Correction ou saisie d'un oubli, avec motif obligatoire.
export default function PresencesDuJour({ orgId }) {
  const aujourdhui = useQuery({
    queryKey: cles.aujourdhui(orgId),
    queryFn: () => chargerAujourdhui(orgId),
  })
  if (aujourdhui.error) {
    return (
      <Message ton="erreur" titre="Les présences n’ont pas pu être chargées">
        <p>{aujourdhui.error.message}</p>
        <Button variante="discret" onClick={() => aujourdhui.refetch()}>
          Réessayer
        </Button>
      </Message>
    )
  }
  if (!aujourdhui.data) return <Spinner libelle="Chargement des présences…" />
  return <Journee orgId={orgId} aujourdhui={aujourdhui.data} />
}

function Journee({ orgId, aujourdhui }) {
  const queryClient = useQueryClient()
  const [jour, setJour] = useState(aujourdhui)
  const [correction, setCorrection] = useState(null)
  const veille = decalerJours(jour, -1)

  const membres = useQuery({ queryKey: cles.membres(orgId), queryFn: () => chargerMembres(orgId) })
  const creneaux = useQuery({
    queryKey: cles.creneaux(orgId),
    queryFn: () => chargerCreneaux(orgId),
  })
  const presences = useQuery({
    queryKey: cles.presencesDuJour(orgId, jour),
    queryFn: () => chargerPresencesDuJour(orgId, jour, veille),
  })
  const affectations = useQuery({
    queryKey: cles.affectations(orgId, jour, jour),
    queryFn: () => chargerAffectations(orgId, jour, jour),
  })

  const erreur = membres.error ?? presences.error ?? creneaux.error ?? affectations.error
  const parId = new Map((membres.data ?? []).map((m) => [m.id, m]))
  const libelleCreneau = new Map((creneaux.data ?? []).map((c) => [c.id, c.label]))
  const prevus = (membreId) =>
    (affectations.data ?? [])
      .filter((a) => a.membership_id === membreId)
      .map((a) => libelleCreneau.get(a.shift_type_id))
      .filter(Boolean)
      .join(', ')

  // Une ligne par pointage, puis une ligne par membre actif sans pointage ce jour-là.
  const pointes = new Set((presences.data ?? []).map((p) => p.membership_id))
  const lignes = [
    ...(presences.data ?? []).map((p) => ({
      id: p.id,
      presence: p,
      membre: parId.get(p.membership_id),
    })),
    ...(membres.data ?? [])
      .filter((m) => m.is_active && !pointes.has(m.id))
      .map((m) => ({ id: `absent-${m.id}`, presence: null, membre: m })),
  ]

  const colonnes = [
    {
      cle: 'nom',
      titre: 'Membre',
      principale: true,
      rendu: ({ membre }) => (
        <span className="presences-du-jour__nom">
          {nomMembre(membre)}
          <span className="presences-du-jour__detail">{membre && libelleRole(membre.role)}</span>
        </span>
      ),
    },
    { cle: 'prevu', titre: 'Prévu', rendu: ({ membre }) => (membre && prevus(membre.id)) || '—' },
    {
      cle: 'arrivee',
      titre: 'Arrivée',
      rendu: ({ presence }) => (
        <span className="presences-du-jour__heure">
          {presence ? formatHeure(presence.check_in_at) : '—'}
          {presence && presence.work_date !== jour && (
            <span className="presences-du-jour__detail"> (veille)</span>
          )}
        </span>
      ),
    },
    {
      cle: 'depart',
      titre: 'Départ',
      rendu: ({ presence }) => (
        <span className="presences-du-jour__heure">
          {presence?.check_out_at ? formatHeure(presence.check_out_at) : '—'}
        </span>
      ),
    },
    {
      cle: 'duree',
      titre: 'Durée',
      rendu: ({ presence }) => dureeEntre(presence?.check_in_at, presence?.check_out_at) ?? '—',
    },
    {
      cle: 'statut',
      titre: 'Statut',
      rendu: ({ presence }) => {
        const statut = statutPresence(presence)
        return (
          <span className="presences-du-jour__tampons">
            <Tampon ton={statut.ton}>{statut.libelle}</Tampon>
            {presence?.is_corrected && <Tampon ton="neutre">Corrigé</Tampon>}
          </span>
        )
      },
    },
    {
      cle: 'action',
      titre: 'Action',
      rendu: (ligne) => (
        <Button
          variante="secondaire"
          onClick={() => setCorrection(ligne)}
          aria-label={`${ligne.presence ? 'Corriger le pointage' : 'Saisir la présence'} de ${nomMembre(ligne.membre)}`}
        >
          {ligne.presence ? 'Corriger' : 'Saisir'}
        </Button>
      ),
    },
  ]

  return (
    <section className="presences-du-jour" aria-labelledby="presences-du-jour-titre">
      <header className="presences-du-jour__entete">
        <h2 id="presences-du-jour-titre" className="presences-du-jour__titre">
          {jour === aujourdhui ? 'Aujourd’hui, ' : ''}
          {libelleJour(jour)}
        </h2>
        <div className="presences-du-jour__navigation">
          <Button
            variante="secondaire"
            iconeDebut={<Icone icone={ChevronLeft} />}
            onClick={() => setJour(veille)}
          >
            Jour précédent
          </Button>
          {jour !== aujourdhui && (
            <Button variante="discret" onClick={() => setJour(aujourdhui)}>
              Aujourd’hui
            </Button>
          )}
          <Button
            variante="secondaire"
            iconeFin={<Icone icone={ChevronRight} />}
            disabled={jour >= aujourdhui}
            onClick={() => setJour(decalerJours(jour, 1))}
          >
            Jour suivant
          </Button>
        </div>
      </header>

      {erreur ? (
        <Message ton="erreur" titre="Les présences n’ont pas pu être chargées">
          <p>{erreur.message}</p>
          <Button variante="discret" onClick={() => presences.refetch()}>
            Réessayer
          </Button>
        </Message>
      ) : (
        <Table
          className="presences-du-jour__table"
          legende={`Présences du ${libelleJour(jour)}`}
          colonnes={colonnes}
          lignes={lignes}
          chargement={membres.isPending || presences.isPending}
          vide={<EmptyState icone={Clock} titre="Aucun membre actif" />}
        />
      )}

      {correction && (
        <ModaleCorrection
          orgId={orgId}
          jour={jour}
          ligne={correction}
          onFermer={() => setCorrection(null)}
          onCorrige={() => {
            setCorrection(null)
            queryClient.invalidateQueries({ queryKey: ['personnel', 'presences', orgId] })
          }}
        />
      )}
    </section>
  )
}
