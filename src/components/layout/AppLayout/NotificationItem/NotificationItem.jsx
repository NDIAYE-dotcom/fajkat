import { formatDateHeure, formatIlYa } from '../../../../lib/format.js'
import Tampon from '../../../ui/Tampon/Tampon.jsx'
import './NotificationItem.css'

// Une ligne de la liste des notifications : un bouton qui ouvre le lien et la marque lue.
// Non lue : en gras, avec un repère dans la marge (la graisse seule ne suffit pas).
export default function NotificationItem({ notification, maintenant, onOuvrir }) {
  const nonLue = !notification.read_at
  const classes = [
    'notification-item',
    nonLue && 'notification-item--non-lue',
    `notification-item--${notification.severity}`,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <li className={classes}>
      <button type="button" className="notification-item__bouton" onClick={onOuvrir}>
        <span className="notification-item__ligne">
          <span className="notification-item__titre">
            {nonLue && <span className="sr-only">Non lue : </span>}
            {notification.title}
          </span>
          {notification.severity === 'urgent' && (
            <Tampon statut="urgent" className="notification-item__tampon" />
          )}
        </span>
        {notification.body && <span className="notification-item__corps">{notification.body}</span>}
        <time
          className="notification-item__date"
          dateTime={notification.created_at}
          title={formatDateHeure(notification.created_at)}
        >
          {formatIlYa(notification.created_at, maintenant)}
        </time>
      </button>
    </li>
  )
}
