import { CalendarX } from 'lucide-react'
import { useState } from 'react'
import EmptyState from '../../../../components/ui/EmptyState/EmptyState.jsx'
import { colonnesDuJour } from '../../agenda.js'
import JaugeSeance from '../JaugeSeance/JaugeSeance.jsx'
import LigneRdv from '../LigneRdv/LigneRdv.jsx'
import './VueJour.css'

// Vue jour : remplissage des séances, puis une colonne par activité (poste de santé) ou par
// praticien (clinique). Sous 640 px, une colonne à la fois, choisie par des boutons.
// rdv : rendez-vous affichés ce jour ; seances : séances du jour avec leurs places prises.
// onOuvrir : détail d'un rendez-vous (report, changement de type).
export default function VueJour({ rdv, seances, types, praticiens, multiPraticiens, onOuvrir }) {
  const colonnes = colonnesDuJour({ multiPraticiens, rdv, seances, types, praticiens })
  const [choisie, setChoisie] = useState(null)
  const active = colonnes.some((c) => c.id === choisie) ? choisie : colonnes[0]?.id
  const nomType = (id) => types.find((t) => t.id === id)?.label ?? 'Type retiré'
  const nomPraticien = (id) => praticiens.find((p) => p.id === id)?.nom

  if (colonnes.length === 0) {
    return (
      <EmptyState
        icone={CalendarX}
        titre="Aucun rendez-vous ce jour"
        texte="Aucune séance n’est prévue non plus."
      />
    )
  }

  return (
    <div className="vue-jour">
      {seances.length > 0 && (
        <section className="vue-jour__seances" aria-label="Séances du jour">
          {seances.map((s) => (
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
        </section>
      )}

      {colonnes.length > 1 && (
        <div className="vue-jour__choix" role="group" aria-label="Colonne affichée">
          {colonnes.map((c) => (
            <button
              key={c.id}
              type="button"
              className="vue-jour__bouton"
              aria-pressed={active === c.id}
              onClick={() => setChoisie(c.id)}
            >
              {`${c.titre} (${c.rdv.length})`}
            </button>
          ))}
        </div>
      )}

      <div className="vue-jour__colonnes">
        {colonnes.map((c) => (
          <section
            key={c.id}
            className={`vue-jour__colonne${active === c.id ? ' vue-jour__colonne--active' : ''}`}
            aria-label={c.titre}
          >
            <h3 className="vue-jour__titre">
              {c.titre}
              <span className="vue-jour__compte">{c.rdv.length}</span>
            </h3>
            {c.rdv.length === 0 ? (
              <p className="vue-jour__vide">Aucun rendez-vous</p>
            ) : (
              <ul className="vue-jour__liste">
                {c.rdv.map((r) => (
                  <LigneRdv
                    key={r.id}
                    rdv={r}
                    precisions={multiPraticiens ? [r.type_label] : [r.practitioner_name]}
                    onOuvrir={onOuvrir}
                  />
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </div>
  )
}
