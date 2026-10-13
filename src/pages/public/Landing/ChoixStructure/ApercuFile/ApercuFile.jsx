import { MessageCircle } from 'lucide-react'
import { useCadence } from '../../../../../hooks/useCadence.js'
import NotificationApercu from '../NotificationApercu/NotificationApercu.jsx'
import './ApercuFile.css'

// Aperçu animé du poste de santé : la file d'attente avance, ticket après ticket,
// puis un rappel de vaccin part sur WhatsApp. Données fictives, construites en HTML/CSS.

const INTERVALLE = 1800
const CYCLE = 8 // un rappel WhatsApp tous les 8 tickets appelés
const NOTIFICATION = [4, 5, 6] // pas du cycle pendant lesquels la notification reste affichée
const VISIBLES = 3 // tickets en attente affichés sous l'appel

const PASSAGES = [
  { motif: 'Consultation', salle: 'Salle 1' },
  { motif: 'CPN', salle: 'Salle de CPN', priorite: 'Femme enceinte' },
  { motif: 'Vaccination', salle: 'Vaccination', priorite: 'Enfant de moins de 5 ans' },
  { motif: 'Pansement', salle: 'Salle de soins' },
  { motif: 'Consultation', salle: 'Salle 1', priorite: 'Personne âgée' },
]

function ticket(n) {
  return {
    n,
    numero: `A-${String(12 + (n % 36)).padStart(3, '0')}`,
    ...PASSAGES[n % PASSAGES.length],
  }
}

// Heure affichée : 08:40, puis trois minutes de plus à chaque appel.
function heure(pas) {
  const minutes = 8 * 60 + 40 + ((pas * 3) % 240)
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

export default function ApercuFile({ actif, statique }) {
  const pas = useCadence(INTERVALLE, actif && !statique)
  const appele = ticket(pas)
  const notification = statique || NOTIFICATION.includes(pas % CYCLE)

  // Fenêtre glissante : position -1 = ticket qui vient d'être appelé (il s'efface vers le haut),
  // 0 à 2 = tickets visibles, 3 = ticket suivant, encore masqué sous la liste.
  const fenetre = []
  for (let n = pas; n <= pas + VISIBLES + 1; n += 1) fenetre.push(ticket(n))

  return (
    <span className="apercu-file" aria-hidden="true">
      <span className="apercu-file__barre">
        <span>Accueil · file du jour</span>
        <span className="apercu-file__heure">{heure(pas)}</span>
      </span>

      <span className="apercu-file__appel">
        <span className="apercu-file__appel-libelle">Au guichet</span>
        <span key={appele.n} className="apercu-file__appel-ticket">
          <span className="apercu-file__appel-numero">{appele.numero}</span>
          <span className="apercu-file__appel-salle">{appele.salle}</span>
        </span>
      </span>

      <span className="apercu-file__liste">
        {fenetre.map((t) => {
          const position = t.n - pas - 1
          return (
            <span
              key={t.n}
              className="apercu-file__ticket"
              data-masque={position < 0 || position >= VISIBLES || undefined}
              style={{ '--position': position }}
            >
              <span className="apercu-file__numero">{t.numero}</span>
              <span className="apercu-file__motif">{t.motif}</span>
              {t.priorite && <span className="apercu-file__priorite">Prioritaire</span>}
            </span>
          )
        })}
      </span>

      <NotificationApercu
        visible={notification}
        icone={MessageCircle}
        titre="Rappel vaccin envoyé sur WhatsApp"
        detail="Maman d’Awa · vaccin de 10 semaines, demain"
      />
    </span>
  )
}
