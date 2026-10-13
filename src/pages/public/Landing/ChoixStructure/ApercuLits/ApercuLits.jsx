import { FlaskConical } from 'lucide-react'
import { useCadence } from '../../../../../hooks/useCadence.js'
import NotificationApercu from '../NotificationApercu/NotificationApercu.jsx'
import './ApercuLits.css'

// Aperçu animé de la clinique : le plan des lits change au fil des admissions et des sorties,
// puis un résultat de laboratoire est validé. Données fictives, construites en HTML/CSS.

const INTERVALLE = 1600
const CYCLE = 8
const NOTIFICATION = [4, 5, 6]

// Un lit passe toujours de « libre » à « occupé », puis « à nettoyer », puis de nouveau « libre ».
const ETATS = ['libre', 'occupe', 'nettoyage']
const LIBELLES = { libre: 'Libre', occupe: 'Occupé', nettoyage: 'À nettoyer' }

const LITS = [
  { nom: 'Ch1·L1', initiales: 'F.S.', initial: 'occupe' },
  { nom: 'Ch1·L2', initiales: 'A.B.', initial: 'occupe' },
  { nom: 'Ch1·L3', initiales: 'K.D.', initial: 'libre' },
  { nom: 'Ch2·L1', initiales: 'M.N.', initial: 'nettoyage' },
  { nom: 'Ch2·L2', initiales: 'M.D.', initial: 'occupe' },
  { nom: 'Ch2·L3', initiales: 'O.F.', initial: 'libre' },
  { nom: 'Ch3·L1', initiales: 'R.S.', initial: 'occupe' },
  { nom: 'Ch3·L2', initiales: 'B.T.', initial: 'occupe' },
]

// Lits qui changent d'état, un par pas, à tour de rôle. En 12 pas, tout revient au départ.
const ROTATION = [3, 2, 6, 5]

function etatDuLit(index, pas) {
  const lit = LITS[index]
  const rang = ROTATION.indexOf(index)
  if (rang === -1 || pas <= rang) return lit.initial
  const changements = Math.floor((pas - rang - 1) / ROTATION.length) + 1
  return ETATS[(ETATS.indexOf(lit.initial) + changements) % ETATS.length]
}

export default function ApercuLits({ actif, statique }) {
  const pas = useCadence(INTERVALLE, actif && !statique)
  const etats = LITS.map((_, index) => etatDuLit(index, pas))
  const litChange = pas > 0 ? ROTATION[(pas - 1) % ROTATION.length] : -1
  const notification = statique || NOTIFICATION.includes(pas % CYCLE)
  const compte = (etat) => etats.filter((e) => e === etat).length

  return (
    <span className="apercu-lits" aria-hidden="true">
      <span className="apercu-lits__barre">
        <span>Hospitalisation · plan des lits</span>
        <span className="apercu-lits__service">Médecine</span>
      </span>

      <span className="apercu-lits__plan">
        {LITS.map((lit, index) => (
          <span key={lit.nom} className="apercu-lits__lit" data-etat={etats[index]}>
            <span className="apercu-lits__nom">{lit.nom}</span>
            {/* Trois calques superposés : changer d'état revient à un fondu, sans recalcul de mise en page. */}
            <span className="apercu-lits__couche apercu-lits__couche--libre">Libre</span>
            <span className="apercu-lits__couche apercu-lits__couche--occupe">{lit.initiales}</span>
            <span className="apercu-lits__couche apercu-lits__couche--nettoyage">À nettoyer</span>
            {index === litChange && <span key={pas} className="apercu-lits__repere" />}
          </span>
        ))}
      </span>

      <span className="apercu-lits__legende">
        {ETATS.map((etat) => (
          <span key={etat} className={`apercu-lits__compte apercu-lits__compte--${etat}`}>
            <span className="apercu-lits__puce" />
            {LIBELLES[etat]} <span className="apercu-lits__nombre">{compte(etat)}</span>
          </span>
        ))}
      </span>

      <NotificationApercu
        visible={notification}
        icone={FlaskConical}
        titre="Résultat de labo validé"
        detail="NFS · M. Diop, chambre 2 · transmis au médecin"
      />
    </span>
  )
}
