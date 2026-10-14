import { useQuery, useQueryClient } from '@tanstack/react-query'
import Button from '../../../../components/ui/Button/Button.jsx'
import Drawer from '../../../../components/ui/Drawer/Drawer.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import Spinner from '../../../../components/ui/Spinner/Spinner.jsx'
import { useToast } from '../../../../hooks/useToast.js'
import { chargerFiche, cles } from '../../api.js'
import { libelleRole } from '../../utils.js'
import FormulaireFiche from '../FormulaireFiche/FormulaireFiche.jsx'
import PiecesJointes from '../PiecesJointes/PiecesJointes.jsx'
import './FicheMembre.css'

// Fiche complète d'un membre, ouverte depuis le registre du personnel (owner et admin).
export default function FicheMembre({ orgId, membre, onFermer, onModifie }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const cle = cles.fiche(orgId, membre.id)
  const fiche = useQuery({ queryKey: cle, queryFn: () => chargerFiche(orgId, membre.id) })
  const nom = membre.profil?.full_name || 'Membre sans nom'

  function surEnregistre(enregistree) {
    queryClient.setQueryData(cle, enregistree)
    toast.succes(`Fiche de ${nom} enregistrée`)
    onModifie()
  }

  return (
    <Drawer ouvert onFermer={onFermer} titre={`Fiche — ${nom}`}>
      <div className="fiche-membre">
        <p className="fiche-membre__role">{libelleRole(membre.role)}</p>
        {fiche.isPending && <Spinner libelle="Chargement de la fiche…" />}
        {fiche.error && (
          <Message ton="erreur" titre="La fiche n’a pas pu être chargée">
            <p>{fiche.error.message}</p>
            <Button variante="discret" onClick={() => fiche.refetch()}>
              Réessayer
            </Button>
          </Message>
        )}
        {fiche.data === null && (
          <Message titre="Aucune fiche">
            <p>Ce membre n’a pas encore de fiche. Rechargez la page dans un instant.</p>
          </Message>
        )}
        {fiche.data && (
          <>
            <FormulaireFiche
              key={fiche.data.updated_at}
              fiche={fiche.data}
              complet
              onEnregistre={surEnregistre}
            />
            <PiecesJointes orgId={orgId} ficheId={fiche.data.id} modifiable />
          </>
        )}
      </div>
    </Drawer>
  )
}
