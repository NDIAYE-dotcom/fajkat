import { BedDouble, ChartNoAxesColumn, FlaskConical, Pill, Stethoscope, User } from 'lucide-react'
import { useCadence } from '../../../../../hooks/useCadence.js'
import CadreApercu from '../CadreApercu/CadreApercu.jsx'
import NotificationApercu from '../NotificationApercu/NotificationApercu.jsx'
import './ApercuLits.css'

// Aperçu animé de la clinique : les chambres changent d'état au fil des admissions et des sorties,
// puis la notification du laboratoire glisse depuis le bas. Données fictives, en HTML/CSS.

const INTERVALLE = 2000

const NAVIGATION = [
  { icone: BedDouble, libelle: 'Hospitalisation', actif: true },
  { icone: User, libelle: 'Patients' },
  { icone: Stethoscope, libelle: 'Consultations' },
  { icone: FlaskConical, libelle: 'Laboratoire' },
  { icone: Pill, libelle: 'Pharmacie' },
  { icone: ChartNoAxesColumn, libelle: 'Rapports' },
]

const CHAMBRES = ['101', '102', '103', '104']

// Une étape par pas : occupant de chaque chambre (null = libre), chambre qui vient de changer,
// notification affichée. L'étape 0 est l'état de la maquette (affiché figé si animations réduites).
const ETAPES = [
  { occupants: ['F.S.', 'A.B.', null, null], repere: 2, notification: true },
  { occupants: ['F.S.', 'A.B.', null, null], repere: 2, notification: true },
  { occupants: ['F.S.', 'A.B.', 'K.D.', null], repere: 2, notification: false },
  { occupants: ['F.S.', null, 'K.D.', null], repere: 1, notification: false },
  { occupants: ['F.S.', 'O.F.', 'K.D.', null], repere: 1, notification: false },
  { occupants: ['F.S.', 'A.B.', null, null], repere: 2, notification: false },
]

// L'animation démarre à l'étape 2 : la notification arrive après les mouvements de lits.
const DEPART = 2

export default function ApercuLits({ actif, statique }) {
  const anime = actif && !statique
  const pas = useCadence(INTERVALLE, anime)
  const etape = ETAPES[statique ? 0 : (pas + DEPART) % ETAPES.length]
  const occupees = etape.occupants.filter(Boolean).length
  const taux = Math.round((occupees / CHAMBRES.length) * 100)

  return (
    <CadreApercu
      logo="H"
      nom="Clinique"
      navigation={NAVIGATION}
      titre="Hospitalisation"
      sousTitre="Plan des lits"
      anime={anime}
      indicateur={
        <span className="apercu-lits__occupation">
          Occupation
          {/* Jauge : seule l'échelle horizontale change (transform). */}
          <span className="apercu-lits__jauge">
            <span
              className="apercu-lits__remplissage"
              style={{ '--taux': occupees / CHAMBRES.length }}
            />
          </span>
          <span key={taux} className="apercu-lits__taux">
            {taux} %
          </span>
        </span>
      }
    >
      <span className="apercu-lits">
        <span className="apercu-lits__plan">
          {CHAMBRES.map((chambre, index) => {
            const occupant = etape.occupants[index]
            return (
              <span
                key={chambre}
                className="apercu-lits__chambre"
                data-etat={occupant ? 'occupe' : 'libre'}
                data-repere={etape.repere === index || undefined}
                style={{ '--i': index }}
              >
                <span className="apercu-lits__numero">Ch. {chambre}</span>
                {/* Deux calques superposés : changer d'état est un fondu, sans recalcul de mise en page. */}
                <span className="apercu-lits__couche apercu-lits__couche--occupe">
                  <span className="apercu-lits__initiales">{occupant ?? ' '}</span>
                  <span className="apercu-lits__statut">
                    <span className="apercu-lits__point">
                      {anime && etape.repere === index && (
                        <span key={pas} className="apercu-lits__pulsation" />
                      )}
                    </span>
                    Occupé
                  </span>
                </span>
                <span className="apercu-lits__couche apercu-lits__couche--libre">
                  <span className="apercu-lits__statut">
                    <span className="apercu-lits__point">
                      {anime && etape.repere === index && (
                        <span key={pas} className="apercu-lits__pulsation" />
                      )}
                    </span>
                    Libre
                  </span>
                </span>
                <span className="apercu-lits__cadre" />
              </span>
            )
          })}
        </span>

        <NotificationApercu
          visible={etape.notification}
          icone={FlaskConical}
          titre="Résultat de labo validé"
          detail="NFS · M. Diop, chambre 2"
          heure="10:24"
        />
      </span>
    </CadreApercu>
  )
}
