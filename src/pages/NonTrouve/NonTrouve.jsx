import { Link } from 'react-router-dom'

export default function NonTrouve() {
  return (
    <main>
      <h1>Page introuvable</h1>
      <p>L’adresse demandée n’existe pas ou a été déplacée.</p>
      <p>
        <Link to="/">Revenir à l’accueil</Link>
      </p>
    </main>
  )
}
