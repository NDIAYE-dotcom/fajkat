import { useState } from 'react'
import Button from '../../../../components/ui/Button/Button.jsx'
import Field from '../../../../components/ui/Field/Field.jsx'
import Input from '../../../../components/ui/Input/Input.jsx'
import { formatHeure } from '../../../../lib/format.js'
import { regrouperAlertes, resumeMesure } from '../../constantes.js'
import AlertesConstantes from '../AlertesConstantes/AlertesConstantes.jsx'
import './HistoriqueConstantes.css'

// Mesures déjà prises pendant ce passage. Une mesure fausse est annulée avec un motif,
// jamais effacée.
export default function HistoriqueConstantes({ mesures, enLigne, onAnnuler }) {
  const [annulation, setAnnulation] = useState(null) // { id, motif, envoi }

  if (!mesures.length) return null
  return (
    <section className="historique-constantes" aria-labelledby="historique-constantes">
      <h3 id="historique-constantes" className="historique-constantes__titre">
        Déjà mesuré aujourd’hui
      </h3>
      <ul className="historique-constantes__liste">
        {mesures.map((m) => (
          <li
            key={m.id}
            className={`historique-constantes__ligne${m.deleted_at ? ' historique-constantes__ligne--annulee' : ''}`}
          >
            <span className="historique-constantes__heure">{formatHeure(m.measured_at)}</span>
            <span className="historique-constantes__valeurs">{resumeMesure(m)}</span>
            {m.deleted_at ? (
              <span className="historique-constantes__motif">Annulée : {m.void_reason}</span>
            ) : (
              <AlertesConstantes alertes={regrouperAlertes(m.alerts, m.systolic, m.diastolic)} />
            )}
            {!m.deleted_at &&
              (annulation?.id === m.id ? (
                <form
                  className="historique-constantes__annulation"
                  onSubmit={async (e) => {
                    e.preventDefault()
                    setAnnulation({ ...annulation, envoi: true })
                    const ok = await onAnnuler(m.id, annulation.motif)
                    setAnnulation(ok ? null : { ...annulation, envoi: false })
                  }}
                >
                  <Field label="Motif de l’annulation" requis>
                    <Input
                      value={annulation.motif}
                      maxLength={200}
                      autoFocus
                      onChange={(e) => setAnnulation({ ...annulation, motif: e.target.value })}
                    />
                  </Field>
                  <Button variante="discret" onClick={() => setAnnulation(null)}>
                    Garder
                  </Button>
                  <Button
                    type="submit"
                    chargement={annulation.envoi}
                    disabled={!enLigne || annulation.motif.trim().length < 3}
                  >
                    Annuler la mesure
                  </Button>
                </form>
              ) : (
                <Button
                  variante="discret"
                  disabled={!enLigne}
                  onClick={() => setAnnulation({ id: m.id, motif: '', envoi: false })}
                >
                  Mesure fausse ?
                </Button>
              ))}
          </li>
        ))}
      </ul>
    </section>
  )
}
