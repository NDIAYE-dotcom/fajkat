import { CircleAlert, CircleCheck, Info } from 'lucide-react'
import Icone from '../Icone/Icone.jsx'
import './Message.css'

const ICONES = { erreur: CircleAlert, info: Info, succes: CircleCheck }

// Message dans la page, au-dessus ou au-dessous d'un formulaire (erreur d'envoi, information).
// Une erreur est annoncée tout de suite (role="alert") ; le reste poliment (role="status").
export default function Message({ ton = 'info', titre, children, action, className = '' }) {
  return (
    <div
      className={`message message--${ton} ${className}`.trim()}
      role={ton === 'erreur' ? 'alert' : 'status'}
    >
      <Icone icone={ICONES[ton]} className="message__icone" />
      <div className="message__texte">
        {titre && <p className="message__titre">{titre}</p>}
        {children && <div className="message__corps">{children}</div>}
        {action && <div className="message__action">{action}</div>}
      </div>
    </div>
  )
}
