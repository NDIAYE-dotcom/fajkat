import './NotificationApercu.css'

// Notification qui glisse depuis le bas dans un aperçu (« Résultat de labo validé »).
// Sa place est réservée : l'apparition ne déplace rien (transform et opacity uniquement).
// flottante : posée par-dessus le bas du parent (qui doit être positionné), sans réserver de place.
export default function NotificationApercu({
  visible,
  icone: Icone,
  titre,
  detail,
  heure,
  flottante,
}) {
  return (
    <span
      className={`notification-apercu ${flottante ? 'notification-apercu--flottante' : ''}`.trim()}
      data-visible={visible || undefined}
    >
      <span className="notification-apercu__icone">
        <Icone size={22} strokeWidth={1.75} />
      </span>
      <span className="notification-apercu__texte">
        <span className="notification-apercu__titre">{titre}</span>
        <span className="notification-apercu__detail">{detail}</span>
      </span>
      {heure && <span className="notification-apercu__heure">{heure}</span>}
    </span>
  )
}
