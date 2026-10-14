import { TriangleAlert } from 'lucide-react'
import { useEffect } from 'react'
import { DOCUMENTS } from '../contenus.js'
import './PageLegale.css'

// Page légale provisoire (mentions légales, confidentialité, CGU).
export default function PageLegale({ document: cle }) {
  const doc = DOCUMENTS[cle]

  useEffect(() => {
    window.document.title = `${doc.titre} — Fajkat`
    window.scrollTo(0, 0)
  }, [doc])

  return (
    <main className="page-legale">
      <p className="page-legale__provisoire" role="note">
        <TriangleAlert size={18} aria-hidden="true" />
        Document provisoire — à faire valider par un juriste
      </p>
      <h1 id="titre-page" className="page-legale__titre" tabIndex={-1}>
        {doc.titre}
      </h1>
      {doc.sections.map((section) => (
        <section key={section.titre} className="page-legale__section">
          <h2 className="page-legale__sous-titre">{section.titre}</h2>
          {section.paragraphes.map((paragraphe) => (
            <p key={paragraphe} className="page-legale__paragraphe">
              {paragraphe}
            </p>
          ))}
        </section>
      ))}
    </main>
  )
}
