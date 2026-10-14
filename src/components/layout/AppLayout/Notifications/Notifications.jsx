import { Bell } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useNotifications } from '../../../../hooks/useNotifications.js'
import { useTitreNonLues } from '../../../../hooks/useTitreNonLues.js'
import Button from '../../../ui/Button/Button.jsx'
import Icone from '../../../ui/Icone/Icone.jsx'
import Message from '../../../ui/Message/Message.jsx'
import Spinner from '../../../ui/Spinner/Spinner.jsx'
import MenuDeroulant from '../MenuDeroulant/MenuDeroulant.jsx'
import NotificationItem from '../NotificationItem/NotificationItem.jsx'
import './Notifications.css'

// Cloche de l'en-tête : pastille des non lues (rouge s'il y en a une urgente), mise à
// jour en temps réel, annonce aux lecteurs d'écran, liste déroulante.
export default function Notifications() {
  const {
    notifications,
    chargement,
    erreur,
    nombreNonLues,
    urgent,
    derniere,
    recharger,
    marquerLue,
    toutMarquerLu,
  } = useNotifications()
  const navigate = useNavigate()
  const [echec, setEchec] = useState(null)
  const [envoi, setEnvoi] = useState(false)

  useTitreNonLues(nombreNonLues)

  // La cloche sonne une fois par nouvelle notification (coupé si mouvement réduit).
  const [sonnee, setSonnee] = useState(null)
  const sonne = Boolean(derniere) && derniere.id !== sonnee

  // Heure relative recalculée chaque minute.
  const [maintenant, setMaintenant] = useState(() => new Date())
  useEffect(() => {
    const minuterie = setInterval(() => setMaintenant(new Date()), 60_000)
    return () => clearInterval(minuterie)
  }, [])

  const pastille = nombreNonLues > 9 ? '9+' : String(nombreNonLues)
  const libelle =
    nombreNonLues === 0
      ? 'Notifications, aucune non lue'
      : `Notifications, ${nombreNonLues} non lue${nombreNonLues > 1 ? 's' : ''}${urgent ? ', dont au moins une urgente' : ''}`

  function ouvrir(notification, fermer) {
    fermer()
    if (!notification.read_at) {
      // La navigation n'attend pas le serveur : une coupure ne bloque pas l'accès.
      marquerLue(notification.id).catch(() => {})
    }
    if (notification.link) navigate(notification.link)
  }

  async function toutLire() {
    setEnvoi(true)
    setEchec(null)
    try {
      await toutMarquerLu()
    } catch (e) {
      setEchec(e.message)
    } finally {
      setEnvoi(false)
    }
  }

  return (
    <>
      <MenuDeroulant
        libelle="Notifications"
        className="notifications"
        declencheur={({ attributs }) => (
          <button
            type="button"
            className={`notifications__bouton${sonne ? ' notifications__bouton--sonne' : ''}`}
            aria-label={libelle}
            onAnimationEnd={() => setSonnee(derniere?.id ?? null)}
            {...attributs}
          >
            <Icone icone={Bell} />
            {nombreNonLues > 0 && (
              <span
                className={`notifications__pastille${urgent ? ' notifications__pastille--urgent' : ''}`}
                aria-hidden="true"
              >
                {pastille}
              </span>
            )}
          </button>
        )}
      >
        {(fermer) => (
          <div className="notifications__panneau">
            <div className="notifications__entete">
              <p className="notifications__titre">Notifications</p>
              {nombreNonLues > 0 && (
                <Button variante="discret" chargement={envoi} onClick={toutLire}>
                  Tout marquer comme lu
                </Button>
              )}
            </div>

            {echec && (
              <Message ton="erreur">
                <p>{echec}</p>
              </Message>
            )}

            {chargement && <Spinner libelle="Chargement des notifications…" />}

            {erreur && !notifications.length && (
              <Message ton="erreur" titre="Notifications indisponibles">
                <p>{erreur.message}</p>
                <Button variante="discret" onClick={recharger}>
                  Réessayer
                </Button>
              </Message>
            )}

            {!chargement && !erreur && notifications.length === 0 && (
              <p className="notifications__vide">Aucune notification pour l’instant.</p>
            )}

            {notifications.length > 0 && (
              <ul className="notifications__liste">
                {notifications.map((n) => (
                  <NotificationItem
                    key={n.id}
                    notification={n}
                    maintenant={maintenant}
                    onOuvrir={() => ouvrir(n, fermer)}
                  />
                ))}
              </ul>
            )}
          </div>
        )}
      </MenuDeroulant>

      {/* Annonce polie, hors du menu : entendue même cloche fermée. */}
      <p className="sr-only" role="status" aria-live="polite">
        {derniere ? `Nouvelle notification : ${derniere.title}` : ''}
      </p>
    </>
  )
}
