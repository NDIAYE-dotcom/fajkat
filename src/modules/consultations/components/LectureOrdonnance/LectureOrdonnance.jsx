import { Printer } from 'lucide-react'
import { useState } from 'react'
import Button from '../../../../components/ui/Button/Button.jsx'
import Icone from '../../../../components/ui/Icone/Icone.jsx'
import { formatDateHeure } from '../../../../lib/format.js'
import { useVoies } from '../../hooks/useOrdonnance.js'
import {
  formatDose,
  LIBELLES_PRISES,
  phraseDuree,
  phraseQuantite,
  PRISES,
  resumeProduit,
} from '../../ordonnance.js'
import ImpressionOrdonnance from '../ImpressionOrdonnance/ImpressionOrdonnance.jsx'
import PictogrammePrise from '../PictogrammePrise/PictogrammePrise.jsx'
import './LectureOrdonnance.css'

// Ordonnances d'une consultation validée, en lecture seule (figées). imprimer : soignants
// qui rédigent seulement.
export default function LectureOrdonnance({ ordonnances, patient, imprimer }) {
  const voies = useVoies()
  const [aImprimer, setAImprimer] = useState(null)
  // Chaque ouverture repart d'une fenêtre neuve (PDF de l'ouverture précédente oublié).
  const [ouvertures, setOuvertures] = useState(0)
  if (!ordonnances?.length) {
    return <p className="lecture-ordonnance__vide">Aucune ordonnance</p>
  }
  return (
    <div className="lecture-ordonnance">
      {ordonnances.map((o) => (
        <article key={o.id} className="lecture-ordonnance__ordonnance">
          <div className="lecture-ordonnance__entete">
            <p className="lecture-ordonnance__signature">
              {`${formatDateHeure(o.prescribed_at)} · ${o.prescriber_name}`}
            </p>
            {imprimer && (
              <Button
                variante="secondaire"
                iconeDebut={<Icone icone={Printer} />}
                disabled={!patient}
                onClick={() => {
                  setOuvertures((n) => n + 1)
                  setAImprimer(o)
                }}
              >
                Imprimer l’ordonnance
              </Button>
            )}
          </div>
          <ol className="lecture-ordonnance__lignes">
            {o.items.map((l) => {
              const detail = resumeProduit({ ...l, dosage: null }, voies.data ?? [])
              const phrases = [phraseDuree(l), phraseQuantite(l)].filter(Boolean).join(' ')
              return (
                <li key={l.id} className="lecture-ordonnance__ligne">
                  <p className="lecture-ordonnance__nom">
                    {l.product_name}
                    {l.dosage && (
                      <span className="lecture-ordonnance__dosage">{` ${l.dosage}`}</span>
                    )}
                  </p>
                  {detail && <p className="lecture-ordonnance__detail">{detail}</p>}
                  {PRISES.some((p) => Number(l[p.champ])) && (
                    <ul className="lecture-ordonnance__prises">
                      {PRISES.map((p) => (
                        <li key={p.cle} className="lecture-ordonnance__prise">
                          <PictogrammePrise prise={p.cle} />
                          <span className="lecture-ordonnance__moment">
                            {LIBELLES_PRISES.fr[p.cle]}
                          </span>
                          <span className="lecture-ordonnance__dose">
                            {formatDose(Number(l[p.champ]) || 0) || '0'}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {phrases && <p className="lecture-ordonnance__detail">{phrases}</p>}
                  {l.instructions && <p className="lecture-ordonnance__detail">{l.instructions}</p>}
                </li>
              )
            })}
          </ol>
          {o.note && <p className="lecture-ordonnance__note">{o.note}</p>}
        </article>
      ))}
      {imprimer && (
        <ImpressionOrdonnance
          key={ouvertures}
          ouvert={Boolean(aImprimer)}
          onFermer={() => setAImprimer(null)}
          ordonnance={aImprimer ?? ordonnances[0]}
          patient={patient}
        />
      )}
    </div>
  )
}
