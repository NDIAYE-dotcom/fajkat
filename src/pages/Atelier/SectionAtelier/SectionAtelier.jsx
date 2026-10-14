import './SectionAtelier.css'

// Grande section de l'atelier (une famille de composants), reliée au sommaire par son id.
export default function SectionAtelier({ id, titre, intro, children }) {
  return (
    <section id={id} className="section-atelier" aria-labelledby={`${id}-titre`}>
      <header className="section-atelier__entete">
        <h2 id={`${id}-titre`} className="section-atelier__titre">
          {titre}
        </h2>
        {intro && <p className="section-atelier__intro">{intro}</p>}
      </header>
      <div className="section-atelier__contenu">{children}</div>
    </section>
  )
}
