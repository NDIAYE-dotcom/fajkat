import { Link } from 'react-router-dom'

// integre : à l'intérieur de l'application connectée (le <main> existe déjà).
export default function NonTrouve({ integre = false }) {
  const Conteneur = integre ? 'div' : 'main'
  return (
    <Conteneur>
      <h1>Page introuvable</h1>
      <p>L’adresse demandée n’existe pas ou a été déplacée.</p>
      <p>
        {integre ? (
          <Link to="/app">Revenir à la journée</Link>
        ) : (
          <Link to="/">Revenir à l’accueil</Link>
        )}
      </p>
    </Conteneur>
  )
}
