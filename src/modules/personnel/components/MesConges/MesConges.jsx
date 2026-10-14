import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import Button from '../../../../components/ui/Button/Button.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import Panel from '../../../../components/ui/Panel/Panel.jsx'
import Spinner from '../../../../components/ui/Spinner/Spinner.jsx'
import Tampon from '../../../../components/ui/Tampon/Tampon.jsx'
import { useToast } from '../../../../hooks/useToast.js'
import { annulerConge, chargerMesConges, chargerMonAppartenance, cles } from '../../api.js'
import { libelleTypeConge, periodeConge, STATUTS_CONGE } from '../../utils.js'
import FormulaireConge from '../FormulaireConge/FormulaireConge.jsx'
import './MesConges.css'

// Onglet « Congés » de Mon espace : nouvelle demande et suivi des demandes.
export default function MesConges({ orgId, userId }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [annulation, setAnnulation] = useState(null)
  const [erreur, setErreur] = useState(null)
  const appartenance = useQuery({
    queryKey: cles.monAppartenance(orgId, userId),
    queryFn: () => chargerMonAppartenance(orgId),
  })
  const conges = useQuery({
    queryKey: cles.mesConges(orgId, userId),
    queryFn: () => chargerMesConges(orgId, userId),
  })

  function rafraichir() {
    queryClient.invalidateQueries({ queryKey: cles.mesConges(orgId, userId) })
  }

  async function annuler(conge) {
    setAnnulation(conge.id)
    setErreur(null)
    try {
      await annulerConge(conge.id)
      toast.succes('Demande annulée')
      rafraichir()
    } catch (e) {
      setErreur(e.message)
    } finally {
      setAnnulation(null)
    }
  }

  const erreurChargement = appartenance.error ?? conges.error

  return (
    <div className="mes-conges">
      <Panel titre="Demander un congé ou une absence" marque>
        {appartenance.isPending && <Spinner libelle="Chargement…" />}
        {erreurChargement && (
          <Message ton="erreur" titre="Vos congés n’ont pas pu être chargés">
            <p>{erreurChargement.message}</p>
            <Button
              variante="discret"
              onClick={() => {
                appartenance.refetch()
                conges.refetch()
              }}
            >
              Réessayer
            </Button>
          </Message>
        )}
        {appartenance.data && (
          <FormulaireConge
            orgId={orgId}
            membreId={appartenance.data}
            onEnvoye={() => {
              toast.succes('Demande envoyée', { message: 'Le responsable va la traiter.' })
              rafraichir()
            }}
          />
        )}
      </Panel>

      {conges.data?.length > 0 && (
        <Panel titre="Mes demandes">
          {erreur && (
            <Message ton="erreur">
              <p>{erreur}</p>
            </Message>
          )}
          <ul className="mes-conges__liste">
            {conges.data.map((c) => {
              const statut = STATUTS_CONGE[c.status]
              return (
                <li key={c.id} className="mes-conges__ligne">
                  <span className="mes-conges__type">{libelleTypeConge(c.leave_type)}</span>
                  <span className="mes-conges__periode">
                    {periodeConge(c.start_date, c.end_date)}
                  </span>
                  <Tampon ton={statut.ton}>{statut.libelle}</Tampon>
                  {c.decision_note && (
                    <span className="mes-conges__note">Réponse : « {c.decision_note} »</span>
                  )}
                  {c.status === 'pending' && (
                    <Button
                      variante="discret"
                      chargement={annulation === c.id}
                      onClick={() => annuler(c)}
                    >
                      Annuler la demande
                    </Button>
                  )}
                </li>
              )
            })}
          </ul>
        </Panel>
      )}
    </div>
  )
}
