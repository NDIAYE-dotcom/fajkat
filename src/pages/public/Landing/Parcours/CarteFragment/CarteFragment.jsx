import './CarteFragment.css'

// Cadre commun des fragments d'interface du parcours : petite fenêtre blanche
// avec un en-tête (icône, écran, précision). actif : déclenche les animations internes,
// rejouées à chaque fois que l'étape redevient active.
export default function CarteFragment({
  icone: Icone,
  titre,
  precision,
  actif,
  className = '',
  children,
}) {
  return (
    <div className={`carte-fragment ${className}`.trim()} data-actif={actif || undefined}>
      <div className="carte-fragment__tete">
        <span className="carte-fragment__icone">
          <Icone size={18} strokeWidth={1.75} />
        </span>
        <span className="carte-fragment__titre">{titre}</span>
        {precision && <span className="carte-fragment__precision">{precision}</span>}
      </div>
      <div className="carte-fragment__corps">{children}</div>
    </div>
  )
}
