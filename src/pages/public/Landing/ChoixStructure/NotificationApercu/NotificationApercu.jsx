import './NotificationApercu.css'

// Notification qui glisse dans un aperçu de produit (« Rappel vaccin envoyé… »).
// Uniquement des <span> : elle s'affiche à l'intérieur du bouton de choix.
export default function NotificationApercu({ visible, icone: Icone, titre, detail }) {
  return (
    <span className="notification-apercu" data-visible={visible || undefined}>
      <span className="notification-apercu__icone">
        <Icone size={16} aria-hidden="true" />
      </span>
      <span className="notification-apercu__texte">
        <span className="notification-apercu__titre">{titre}</span>
        <span className="notification-apercu__detail">{detail}</span>
      </span>
    </span>
  )
}
