import { RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import Button from '../../../components/ui/Button/Button.jsx'
import Icone from '../../../components/ui/Icone/Icone.jsx'
import Message from '../../../components/ui/Message/Message.jsx'
import Spinner from '../../../components/ui/Spinner/Spinner.jsx'
import { formatHeure } from '../../../lib/format.js'
import { chargerSuiviTicket } from '../../../modules/accueil/api.js'
import { personnes } from '../../../modules/accueil/utils.js'
import './SuiviTicket.css'

// Actualisation automatique : jamais plus d'une fois par minute (beaucoup de téléphones,
// forfaits limités, et une base partagée par toutes les structures).
const INTERVALLE_MS = 60 * 1000

// Suivi d'un ticket de file, ouvert par le QR imprimé (sans connexion). Numéro, personnes
// devant, salle : ni nom, ni motif, ni service. Le jeton ne vaut que le jour du passage.
export default function SuiviTicket() {
  const { code } = useParams()
  const [suivi, setSuivi] = useState(null)
  const [erreur, setErreur] = useState(null)
  const [chargement, setChargement] = useState(true)
  const [misAJour, setMisAJour] = useState(null)
  const dernier = useRef(0)

  const actualiser = useCallback(async () => {
    dernier.current = Date.now()
    setChargement(true)
    try {
      setSuivi(await chargerSuiviTicket(code))
      setErreur(null)
      setMisAJour(new Date())
    } catch (e) {
      // Le dernier état connu reste affiché.
      setErreur(e.message)
    } finally {
      setChargement(false)
    }
  }, [code])

  const actif = !suivi || ['waiting', 'called'].includes(suivi.status)

  // Première lecture, puis toutes les 60 s tant que l'onglet est visible et le ticket en
  // cours. Au retour sur l'onglet, une lecture si la dernière date de plus d'une minute.
  useEffect(() => {
    if (dernier.current === 0) actualiser()
    if (!actif) return undefined
    const minuteur = setInterval(() => {
      if (document.visibilityState === 'visible') actualiser()
    }, INTERVALLE_MS)
    const surRetour = () => {
      if (document.visibilityState === 'visible' && Date.now() - dernier.current >= INTERVALLE_MS) {
        actualiser()
      }
    }
    document.addEventListener('visibilitychange', surRetour)
    return () => {
      clearInterval(minuteur)
      document.removeEventListener('visibilitychange', surRetour)
    }
  }, [actualiser, actif])

  // Page personnelle : jamais indexée.
  useEffect(() => {
    const robots = document.createElement('meta')
    robots.name = 'robots'
    robots.content = 'noindex, nofollow'
    document.head.append(robots)
    return () => robots.remove()
  }, [])

  useEffect(() => {
    document.title = suivi?.ticket_number
      ? `Ticket ${suivi.ticket_number} — Fajkat`
      : 'Suivi du ticket — Fajkat'
  }, [suivi?.ticket_number])

  return (
    <main className="suivi-ticket">
      <div className="suivi-ticket__carte">
        {suivi?.org_name && <p className="suivi-ticket__structure">{suivi.org_name}</p>}
        {!suivi && chargement && (
          <p className="suivi-ticket__attente">
            <Spinner taille={20} /> Lecture du ticket…
          </p>
        )}
        {suivi && <Etat suivi={suivi} />}

        {erreur && (
          <Message ton="erreur">
            <p>{erreur}</p>
          </Message>
        )}

        {(suivi || erreur) && (
          <div className="suivi-ticket__pied">
            {actif && (
              <Button
                variante="secondaire"
                iconeDebut={<Icone icone={RefreshCw} />}
                chargement={chargement}
                onClick={actualiser}
              >
                Actualiser
              </Button>
            )}
            {misAJour && (
              <p className="suivi-ticket__heure" aria-live="polite">
                Mis à jour à {formatHeure(misAJour)}
                {actif && ', puis chaque minute'}.
              </p>
            )}
          </div>
        )}
      </div>
      <p className="suivi-ticket__marque">Fajkat</p>
    </main>
  )
}

function Etat({ suivi }) {
  switch (suivi.status) {
    case 'waiting':
      return (
        <>
          <Numero valeur={suivi.ticket_number} />
          <p className="suivi-ticket__statut" aria-live="polite">
            {suivi.ahead === 0
              ? 'Vous êtes le prochain.'
              : `${personnes(suivi.ahead ?? 0)} avant vous.`}
          </p>
          <p className="suivi-ticket__aide">
            Restez près de la salle d’attente : votre numéro s’affichera à l’écran.
          </p>
        </>
      )
    case 'called':
      return (
        <>
          <Numero valeur={suivi.ticket_number} />
          <p className="suivi-ticket__statut suivi-ticket__statut--appel" role="alert">
            C’est votre tour.
          </p>
          {suivi.room && (
            <p className="suivi-ticket__salle">
              Présentez-vous : <strong>{suivi.room}</strong>
            </p>
          )}
        </>
      )
    case 'done':
      return (
        <>
          <Numero valeur={suivi.ticket_number} />
          <p className="suivi-ticket__statut">Votre passage est terminé. Bon rétablissement.</p>
        </>
      )
    case 'expired':
      return (
        <p className="suivi-ticket__statut">
          Ce ticket n’est plus valable : il ne sert que le jour où il a été remis.
        </p>
      )
    default:
      return (
        <p className="suivi-ticket__statut">
          Ticket introuvable. Vérifiez que vous avez scanné le QR code en entier, ou demandez à
          l’accueil.
        </p>
      )
  }
}

function Numero({ valeur }) {
  return (
    <p className="suivi-ticket__numero">
      <span className="suivi-ticket__mention">Votre numéro</span>
      <span className="suivi-ticket__chiffres">{valeur}</span>
    </p>
  )
}
