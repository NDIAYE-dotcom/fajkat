import dayjs from 'dayjs'
import Button from '../../../../components/ui/Button/Button.jsx'
import { nomJour } from '../../agenda.js'
import JaugeSeance from '../JaugeSeance/JaugeSeance.jsx'
import LigneRdvCompacte from '../LigneRdvCompacte/LigneRdvCompacte.jsx'
import MarquesJour from '../MarquesJour/MarquesJour.jsx'
import './VueSemaine.css'

// Au-delà, le jour renvoie à sa vue détaillée : une séance de 40 enfants ne remplit pas
// toute la semaine.
const LIGNES_MAX = 8

// Vue semaine : sept jours côte à côte (empilés sur téléphone), avec les séances et leur
// remplissage, puis les rendez-vous. jours : [{ iso, rdv, seances, ferie, ferme }].
export default function VueSemaine({
  jours,
  aujourdhui,
  types,
  praticiens,
  multiPraticiens,
  onOuvrirJour,
}) {
  const nomType = (id) => types.find((t) => t.id === id)?.label ?? 'Type retiré'
  const nomPraticien = (id) => praticiens.find((p) => p.id === id)?.nom

  return (
    <div className="vue-semaine">
      {jours.map((j) => (
        <section
          key={j.iso}
          className={`vue-semaine__jour${j.iso === aujourdhui ? ' vue-semaine__jour--aujourdhui' : ''}`}
          aria-label={dayjs(j.iso).format('dddd D MMMM')}
        >
          <header className="vue-semaine__entete">
            <button type="button" className="vue-semaine__date" onClick={() => onOuvrirJour(j.iso)}>
              <span className="vue-semaine__nom-jour">{nomJour(j.iso)}</span>
              <span className="vue-semaine__numero">{dayjs(j.iso).format('D MMM')}</span>
            </button>
            <span className="vue-semaine__compte">
              {j.rdv.length ? `${j.rdv.length} RDV` : '—'}
            </span>
            <span className="vue-semaine__marques">
              <MarquesJour ferie={j.ferie} ferme={j.ferme} />
            </span>
          </header>

          {j.seances.map((s) => (
            <JaugeSeance
              key={s.id}
              seance={s}
              titre={[
                s.label || nomType(s.appointment_type_id),
                nomPraticien(s.practitioner_membership_id),
              ]
                .filter(Boolean)
                .join(' · ')}
            />
          ))}

          {j.rdv.length > 0 && (
            <ul className="vue-semaine__liste">
              {j.rdv.slice(0, LIGNES_MAX).map((r) => (
                <LigneRdvCompacte
                  key={r.id}
                  rdv={r}
                  precisions={[r.type_label, multiPraticiens && r.practitioner_name]}
                />
              ))}
            </ul>
          )}
          {j.rdv.length > LIGNES_MAX && (
            <Button variante="discret" onClick={() => onOuvrirJour(j.iso)}>
              {`Voir les ${j.rdv.length - LIGNES_MAX} autres`}
            </Button>
          )}
        </section>
      ))}
    </div>
  )
}
