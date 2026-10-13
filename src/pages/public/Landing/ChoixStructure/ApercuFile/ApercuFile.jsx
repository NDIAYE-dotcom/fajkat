import {
  BriefcaseMedical,
  ChartNoAxesColumn,
  House,
  MessageCircle,
  Plus,
  Stethoscope,
  User,
  Users,
} from 'lucide-react'
import { useCadence } from '../../../../../hooks/useCadence.js'
import CadreApercu from '../CadreApercu/CadreApercu.jsx'
import NotificationApercu from '../NotificationApercu/NotificationApercu.jsx'
import './ApercuFile.css'

// Aperçu animé du poste de santé : toutes les 4 s, le ticket suivant passe au guichet
// et la file remonte. Données fictives, construites en HTML/CSS.

const INTERVALLE = 4000
const VISIBLES = 2 // tickets en attente affichés sous le guichet
const RAPPEL_TOUS_LES = 3 // un rappel WhatsApp passe tous les 3 appels

const NAVIGATION = [
  { icone: House, libelle: 'Accueil', actif: true },
  { icone: User, libelle: 'Patients' },
  { icone: Stethoscope, libelle: 'Consultations' },
  { icone: BriefcaseMedical, libelle: 'Pharmacie' },
  { icone: ChartNoAxesColumn, libelle: 'Rapports' },
]

const PASSAGES = [
  { motif: 'Pansement', salle: 'Salle de soins' },
  { motif: 'Consultation', salle: 'Salle 1', prioritaire: true },
  { motif: 'Consultation', salle: 'Salle 1', prioritaire: true },
  { motif: 'CPN', salle: 'Salle de CPN', prioritaire: true },
  { motif: 'Vaccination', salle: 'Salle de vaccination' },
]

function ticket(n) {
  return {
    n,
    numero: `A-${String(45 + (n % 50)).padStart(3, '0')}`,
    ...PASSAGES[n % PASSAGES.length],
  }
}

// 10:19, puis quatre minutes de plus à chaque appel.
function heure(pas) {
  const minutes = 10 * 60 + 19 + ((pas * 4) % 360)
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

export default function ApercuFile({ actif, statique }) {
  const anime = actif && !statique
  const pas = useCadence(INTERVALLE, anime)
  const appele = ticket(pas)
  const rappel = anime && pas % RAPPEL_TOUS_LES === RAPPEL_TOUS_LES - 1

  // Fenêtre glissante : -1 = ticket qui vient de passer au guichet (il s'efface vers le haut),
  // 0 et 1 = tickets visibles, 2 = ticket suivant, encore masqué sous la liste.
  const fenetre = []
  for (let n = pas; n <= pas + VISIBLES + 1; n += 1) fenetre.push(ticket(n))

  return (
    <CadreApercu
      logo={<Plus size={22} strokeWidth={3} />}
      nom="Poste de santé"
      navigation={NAVIGATION}
      titre="Accueil"
      sousTitre="File du jour"
      heure={heure(pas)}
      anime={anime}
    >
      <span className="apercu-file">
        <span className="apercu-file__guichet">
          <span className="apercu-file__decor" />
          <span key={appele.n} className="apercu-file__appel">
            <span className="apercu-file__libelle">Au guichet</span>
            <span className="apercu-file__numero-appel">{appele.numero}</span>
            <span className="apercu-file__salle">{appele.salle}</span>
          </span>
          <span className="apercu-file__pictogramme">
            {/* Onde à chaque appel : la clé change, l'animation repart. */}
            {anime && <span key={pas} className="apercu-file__onde" />}
            <Users size={22} strokeWidth={1.75} />
          </span>
          {/* Décompte jusqu'au prochain appel */}
          {anime && <span key={`d${pas}`} className="apercu-file__decompte" />}
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
                <User className="apercu-file__personne" size={18} strokeWidth={1.75} />
                <span className="apercu-file__numero">{t.numero}</span>
                <span className="apercu-file__motif">{t.motif}</span>
                {t.prioritaire && (
                  // Le prochain prioritaire est signalé en rouge, les suivants en gris.
                  <span className="apercu-file__badge" data-prochain={position === 0 || undefined}>
                    Prioritaire
                  </span>
                )}
              </span>
            )
          })}
          <NotificationApercu
            flottante
            visible={rappel}
            icone={MessageCircle}
            titre="Rappel WhatsApp envoyé"
            detail="Maman d’Awa · vaccin de 10 semaines"
          />
        </span>
      </span>
    </CadreApercu>
  )
}
