import { CheckCheck } from 'lucide-react'
import './RappelWhatsApp.css'

// Téléphone qui reçoit le rappel de CPN sur WhatsApp, la veille du rendez-vous.
export default function RappelWhatsApp({ actif }) {
  return (
    <div className="rappel-whatsapp" data-actif={actif || undefined}>
      <div className="rappel-whatsapp__ecran">
        <div className="rappel-whatsapp__barre">
          <span className="rappel-whatsapp__avatar">PS</span>
          <span className="rappel-whatsapp__contact">
            <span className="rappel-whatsapp__nom">Poste de santé</span>
            <span className="rappel-whatsapp__statut">en ligne</span>
          </span>
        </div>

        <div className="rappel-whatsapp__fil">
          <p className="rappel-whatsapp__jour">Jeudi 12/11</p>
          <p className="rappel-whatsapp__bulle" style={{ '--i': 0 }}>
            Bonjour, ceci est un rappel du poste de santé : la consultation prénatale d’Awa est
            prévue demain vendredi 13/11, à partir de 8 h.
            <span className="rappel-whatsapp__heure">18:00</span>
          </p>
          <p className="rappel-whatsapp__bulle" style={{ '--i': 1 }}>
            Pensez à apporter son carnet de santé.
            <span className="rappel-whatsapp__heure">
              18:00 <CheckCheck size={14} />
            </span>
          </p>
        </div>
      </div>
      <p className="rappel-whatsapp__note">Modèle de message, en français ou en wolof</p>
    </div>
  )
}
