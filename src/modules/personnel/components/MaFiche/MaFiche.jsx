import { useQuery, useQueryClient } from '@tanstack/react-query'
import Button from '../../../../components/ui/Button/Button.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import Panel from '../../../../components/ui/Panel/Panel.jsx'
import Spinner from '../../../../components/ui/Spinner/Spinner.jsx'
import { useToast } from '../../../../hooks/useToast.js'
import { chargerMaFiche, cles } from '../../api.js'
import FormulaireFiche from '../FormulaireFiche/FormulaireFiche.jsx'
import PiecesJointes from '../PiecesJointes/PiecesJointes.jsx'
import './MaFiche.css'

// Fiche de l'utilisateur dans la structure active. Owner et admin modifient tous les
// champs ; les autres membres, leur téléphone et leur contact d'urgence.
export default function MaFiche({ orgId, userId, responsable }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const cle = cles.maFiche(orgId, userId)
  const fiche = useQuery({ queryKey: cle, queryFn: () => chargerMaFiche(orgId, userId) })

  function surEnregistre(enregistree) {
    queryClient.setQueryData(cle, (ancienne) => ({ ...ancienne, ...enregistree }))
    toast.succes('Votre fiche est enregistrée')
  }

  return (
    <Panel titre="Ma fiche" marque className="ma-fiche">
      {fiche.isPending && <Spinner libelle="Chargement de votre fiche…" />}
      {fiche.error && (
        <Message ton="erreur" titre="Votre fiche n’a pas pu être chargée">
          <p>{fiche.error.message}</p>
          <Button variante="discret" onClick={() => fiche.refetch()}>
            Réessayer
          </Button>
        </Message>
      )}
      {fiche.data === null && (
        <Message titre="Aucune fiche">
          <p>Votre fiche n’existe pas encore. Rechargez la page dans un instant.</p>
        </Message>
      )}
      {fiche.data && (
        <div className="ma-fiche__corps">
          <FormulaireFiche
            key={fiche.data.updated_at}
            fiche={fiche.data}
            complet={responsable}
            onEnregistre={surEnregistre}
          />
          <PiecesJointes orgId={orgId} ficheId={fiche.data.id} modifiable={responsable} />
        </div>
      )}
    </Panel>
  )
}
