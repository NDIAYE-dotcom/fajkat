import Button from '../../../../components/ui/Button/Button.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import Skeleton from '../../../../components/ui/Skeleton/Skeleton.jsx'
import './ChargementEtape.css'

// Écran en cours de chargement, ou chargement en échec avec un bouton pour réessayer.
export default function ChargementEtape({ erreur, onReessayer }) {
  if (erreur) {
    return (
      <Message
        ton="erreur"
        titre="Ces informations n’ont pas pu être chargées"
        action={<Button onClick={onReessayer}>Réessayer</Button>}
      >
        <p>{erreur.message}</p>
      </Message>
    )
  }
  return (
    <div className="chargement-etape" aria-busy="true">
      <span className="sr-only">Chargement…</span>
      <Skeleton forme="titre" largeur="60%" />
      <Skeleton largeur="90%" />
      <Skeleton forme="bloc" hauteur="8rem" />
      <Skeleton forme="bloc" hauteur="8rem" />
    </div>
  )
}
