import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarOff } from 'lucide-react'
import { useState } from 'react'
import Button from '../../../../components/ui/Button/Button.jsx'
import EmptyState from '../../../../components/ui/EmptyState/EmptyState.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import Spinner from '../../../../components/ui/Spinner/Spinner.jsx'
import Tampon from '../../../../components/ui/Tampon/Tampon.jsx'
import { chargerAffectations, chargerConges, chargerMembres, cles } from '../../api.js'
import {
  aujourdhui,
  decalerJours,
  libelleRole,
  libelleTypeConge,
  nomMembre,
  periodeConge,
  STATUTS_CONGE,
} from '../../utils.js'
import ModaleDecision from '../ModaleDecision/ModaleDecision.jsx'
import './ListeConges.css'

// Congés à traiter et congés validés (owner et admin). Les gardes prévues pendant un
// congé sont signalées sur chaque demande.
export default function ListeConges({ orgId }) {
  const queryClient = useQueryClient()
  const [ouverte, setOuverte] = useState(null)
  // Demandes terminées depuis moins d'un mois : l'historique récent reste visible.
  const [depuis] = useState(() => decalerJours(aujourdhui(), -30))
  const conges = useQuery({
    queryKey: cles.conges(orgId, depuis),
    queryFn: () => chargerConges(orgId, depuis),
  })
  const membres = useQuery({ queryKey: cles.membres(orgId), queryFn: () => chargerMembres(orgId) })

  const actives = (conges.data ?? []).filter((c) => ['pending', 'approved'].includes(c.status))
  const du = actives.reduce((min, c) => (c.start_date < min ? c.start_date : min), '9999-12-31')
  const au = actives.reduce((max, c) => (c.end_date > max ? c.end_date : max), '0000-01-01')
  const affectations = useQuery({
    queryKey: cles.affectations(orgId, du, au),
    queryFn: () => chargerAffectations(orgId, du, au),
    enabled: actives.length > 0,
  })

  const parId = new Map((membres.data ?? []).map((m) => [m.id, m]))
  const nbGardes = (c) =>
    (affectations.data ?? []).filter(
      (a) =>
        a.membership_id === c.membership_id &&
        a.shift_date >= c.start_date &&
        a.shift_date <= c.end_date,
    ).length

  if (conges.error || membres.error) {
    return (
      <Message ton="erreur" titre="Les congés n’ont pas pu être chargés">
        <p>{(conges.error ?? membres.error).message}</p>
        <Button variante="discret" onClick={() => conges.refetch()}>
          Réessayer
        </Button>
      </Message>
    )
  }
  if (conges.isPending || membres.isPending) return <Spinner libelle="Chargement des congés…" />

  const sections = [
    { id: 'pending', titre: 'À traiter', liste: actives.filter((c) => c.status === 'pending') },
    { id: 'approved', titre: 'Validés', liste: actives.filter((c) => c.status === 'approved') },
    {
      id: 'autres',
      titre: 'Refusés ou annulés récemment',
      liste: (conges.data ?? []).filter((c) => ['rejected', 'cancelled'].includes(c.status)),
    },
  ]

  if (!conges.data.length) {
    return (
      <EmptyState
        icone={CalendarOff}
        titre="Aucune demande"
        texte="Les demandes de congé de l’équipe apparaîtront ici."
      />
    )
  }

  return (
    <div className="liste-conges">
      {sections.map(
        (section) =>
          section.liste.length > 0 && (
            <section key={section.id} aria-labelledby={`conges-${section.id}`}>
              <h2 id={`conges-${section.id}`} className="liste-conges__titre">
                {section.titre}{' '}
                <span className="liste-conges__nombre">({section.liste.length})</span>
              </h2>
              <ul className="liste-conges__liste">
                {section.liste.map((c) => {
                  const membre = parId.get(c.membership_id)
                  const statut = STATUTS_CONGE[c.status]
                  const gardes = ['pending', 'approved'].includes(c.status) ? nbGardes(c) : 0
                  return (
                    <li key={c.id} className="liste-conges__demande">
                      <span className="liste-conges__nom">
                        {nomMembre(membre)}
                        <span className="liste-conges__detail">
                          {membre && libelleRole(membre.role)}
                        </span>
                      </span>
                      <span>
                        {libelleTypeConge(c.leave_type)}
                        <span className="liste-conges__periode">
                          {periodeConge(c.start_date, c.end_date)}
                        </span>
                      </span>
                      <span className="liste-conges__tampons">
                        <Tampon ton={statut.ton}>{statut.libelle}</Tampon>
                        {gardes > 0 && (
                          <Tampon ton="alerte">
                            {gardes > 1 ? `${gardes} gardes` : '1 garde'} en conflit
                          </Tampon>
                        )}
                      </span>
                      {['pending', 'approved'].includes(c.status) && (
                        <Button
                          variante={c.status === 'pending' ? 'primaire' : 'secondaire'}
                          onClick={() => setOuverte(c)}
                          aria-label={`${c.status === 'pending' ? 'Traiter' : 'Voir'} la demande de ${nomMembre(membre)}`}
                        >
                          {c.status === 'pending' ? 'Traiter' : 'Voir'}
                        </Button>
                      )}
                    </li>
                  )
                })}
              </ul>
            </section>
          ),
      )}

      {ouverte && (
        <ModaleDecision
          orgId={orgId}
          conge={ouverte}
          membre={parId.get(ouverte.membership_id)}
          onFermer={() => setOuverte(null)}
          onDecide={() => {
            setOuverte(null)
            queryClient.invalidateQueries({ queryKey: ['personnel', 'conges', orgId] })
            queryClient.invalidateQueries({ queryKey: ['personnel', 'calendrier-conges', orgId] })
          }}
        />
      )}
    </div>
  )
}
