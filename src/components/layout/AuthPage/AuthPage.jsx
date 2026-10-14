import { useEffect } from 'react'
import './AuthPage.css'

// Contenu d'une page de connexion ou d'inscription : titre, introduction, formulaire, liens.
export default function AuthPage({ titre, intro, pied, children }) {
  useEffect(() => {
    document.title = `${titre} — Fajkat`
  }, [titre])

  return (
    <div className="auth-page">
      <header className="auth-page__entete">
        <h1 className="auth-page__titre">{titre}</h1>
        {intro && <p className="auth-page__intro">{intro}</p>}
      </header>
      {children}
      {pied && <footer className="auth-page__pied">{pied}</footer>}
    </div>
  )
}
