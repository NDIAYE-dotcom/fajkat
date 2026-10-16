import Button from '../../../../components/ui/Button/Button.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import Skeleton from '../../../../components/ui/Skeleton/Skeleton.jsx'
import './PanneauReglages.css'

// Onglet de paramètres : phrase d'explication, erreur du dernier envoi, erreur de
// chargement (avec « Réessayer »), squelette pendant le chargement, puis le contenu.
// requetes : requêtes React Query dont dépend l'onglet.
export default function PanneauReglages({ intro, erreur, requetes = [], children }) {
  const enEchec = requetes.find((r) => r.error)
  const enCours = requetes.some((r) => r.isPending && r.fetchStatus !== 'idle')
  return (
    <div className="panneau-reglages">
      {intro && <p className="panneau-reglages__intro">{intro}</p>}
      {erreur && (
        <Message ton="erreur">
          <p>{erreur}</p>
        </Message>
      )}
      {enEchec && (
        <Message
          ton="erreur"
          action={
            <Button onClick={() => requetes.forEach((r) => r.error && r.refetch())}>
              Réessayer
            </Button>
          }
        >
          <p>{enEchec.error.message}</p>
        </Message>
      )}
      {enCours ? <Skeleton forme="bloc" hauteur="12rem" /> : !enEchec && children}
    </div>
  )
}

// Bloc « Nouveau … » : formulaire ouvert, ou bouton qui l'ouvre.
export function BlocNouveau({ titre, ouvert, onOuvrir, libelleBouton, desactive, children }) {
  if (!ouvert) {
    return (
      <Button
        variante="secondaire"
        className="panneau-reglages__ajout"
        disabled={desactive}
        onClick={onOuvrir}
      >
        {libelleBouton}
      </Button>
    )
  }
  return (
    <section className="panneau-reglages__nouveau" aria-label={titre}>
      <h3 className="panneau-reglages__titre">{titre}</h3>
      {children}
    </section>
  )
}
