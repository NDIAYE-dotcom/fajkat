import { useApparition } from '../../../../hooks/useApparition.js'
import './Atouts.css'

// Trois points forts de l'offre, en colonnes séparées par des filets (pas de cartes).
export default function Atouts({ atouts }) {
  const [ref, apparu] = useApparition()

  return (
    <section
      ref={ref}
      className="atouts"
      data-apparu={apparu || undefined}
      aria-labelledby="atouts-titre"
    >
      <div className="atouts__interieur">
        <h2 id="atouts-titre" className="atouts__titre apparition">
          {atouts.titre}
        </h2>
        <ul className="atouts__liste">
          {atouts.elements.map(({ icone: Icone, titre, texte }, index) => (
            <li key={titre} className="atouts__element apparition" style={{ '--rang': index + 1 }}>
              {Icone && <Icone className="atouts__icone" size={22} aria-hidden="true" />}
              <h3 className="atouts__element-titre">{titre}</h3>
              <p className="atouts__element-texte">{texte}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
