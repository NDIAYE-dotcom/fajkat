import Button from '../../../../components/ui/Button/Button.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import { formatHeure } from '../../../../lib/format.js'
import './ConflitVersion.css'

// Même consultation modifiée sur un autre appareil : rien n'est écrasé sans un choix.
// Les deux versions restent lisibles le temps de choisir.
//   conflit : { local: { contenu, date }, serveur: { contenu, date, mine, auteur, statut } }
export default function ConflitVersion({ conflit, onGarderServeur, onGarderLocal }) {
  if (!conflit) {
    return (
      <Message ton="erreur" titre="Cette consultation a été modifiée sur un autre appareil">
        <p>Lecture de la version enregistrée sur le serveur…</p>
      </Message>
    )
  }
  const { local, serveur } = conflit
  const ailleurs = serveur.statut !== 'draft' || serveur.mine === false
  return (
    <Message ton="erreur" titre="Cette consultation a été modifiée sur un autre appareil">
      <p>
        {`Le serveur a une version enregistrée à ${formatHeure(serveur.date)}, et cet appareil garde une saisie de ${formatHeure(local.date)} qui n’a pas été envoyée. Rien n’a été écrasé : choisissez la version à garder.`}
      </p>
      <dl className="conflit-version__versions">
        <div>
          <dt>Motif sur le serveur</dt>
          <dd>{serveur.contenu.reason?.trim() || '—'}</dd>
        </div>
        <div>
          <dt>Motif sur cet appareil</dt>
          <dd>{local.contenu.reason?.trim() || '—'}</dd>
        </div>
      </dl>
      {ailleurs ? (
        <p>
          {serveur.statut !== 'draft'
            ? 'La consultation a été validée entre-temps : la saisie de cet appareil ne peut plus y être ajoutée. Ajoutez au besoin un avenant.'
            : `La consultation est maintenant tenue par ${serveur.auteur}.`}
        </p>
      ) : (
        <div className="conflit-version__actions">
          <Button variante="secondaire" onClick={onGarderServeur}>
            Garder la version du serveur
          </Button>
          <Button onClick={onGarderLocal}>Garder la saisie de cet appareil</Button>
        </div>
      )}
    </Message>
  )
}
