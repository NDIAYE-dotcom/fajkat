import Icone from '../Icone/Icone.jsx'
import './EmptyState.css'

// État vide : dit ce qui manque et propose la prochaine action.
// icone : composant lucide (ex. Inbox) ; action : un <Button>.
export default function EmptyState({ icone, titre, texte, action, niveau = 3, className = '' }) {
  const Titre = `h${niveau}`
  return (
    <div className={`empty-state ${className}`.trim()}>
      {icone && (
        <span className="empty-state__icone" aria-hidden="true">
          <Icone icone={icone} taille={28} />
        </span>
      )}
      <Titre className="empty-state__titre">{titre}</Titre>
      {texte && <p className="empty-state__texte">{texte}</p>}
      {action && <div className="empty-state__action">{action}</div>}
    </div>
  )
}
