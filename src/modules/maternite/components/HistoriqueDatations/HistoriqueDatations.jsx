import Button from '../../../../components/ui/Button/Button.jsx'
import Tampon from '../../../../components/ui/Tampon/Tampon.jsx'
import { formatDate } from '../../../../lib/format.js'
import { formatSA, joursEntre, LIBELLES_DATATION } from '../../grossesse.js'
import './HistoriqueDatations.css'

// Ce que la datation a mesuré : « DDR le 01/03/2026 », « 11 SA à l'échographie du 20/10 »…
function detail(d) {
  if (d.kind === 'lmp') return `DDR le ${formatDate(d.lmp_date)}`
  if (d.edd_reported) return `DPA lue sur le compte rendu du ${formatDate(d.exam_date)}`
  const lieu = d.kind === 'ultrasound' ? 'à l’échographie' : 'estimé'
  return `${formatSA(d.ga_days_at_exam)} ${lieu} du ${formatDate(d.exam_date)}`
}

const METHODES = { naegele: 'règle de Naegele', plus_days: 'DDR + ', ga: 'âge à l’examen + ' }

function methode(d) {
  if (d.edd_method === 'naegele') return METHODES.naegele
  return `${METHODES[d.edd_method]}${d.length_days} jours`
}

// Historique des datations, la plus récente en haut ; retenir une ancienne datation.
// retenir : null (lecture seule) ou fonction (datation) ; occupe : id en cours d'envoi.
export default function HistoriqueDatations({ datations, retenir, occupe, enLigne }) {
  const retenue = datations.find((d) => d.is_current)
  return (
    <ol className="historique-datations">
      {datations.map((d) => (
        <li key={d.id} className="historique-datations__ligne">
          <div className="historique-datations__texte">
            <p className="historique-datations__titre">
              <span>{LIBELLES_DATATION[d.kind]}</span>
              {d.is_current && <Tampon ton="primaire">Retenue</Tampon>}
            </p>
            <p>{detail(d)}</p>
            <p className="historique-datations__doux">
              DPA <span className="historique-datations__chiffres">{formatDate(d.edd)}</span> (
              {methode(d)})
            </p>
            {/* Écart de terme avec la datation retenue : information seulement, aucun seuil. */}
            {retenue && !d.is_current && (
              <p className="historique-datations__ecart">
                Écart avec la datation retenue :{' '}
                <span className="historique-datations__chiffres">
                  {formatSA(Math.abs(joursEntre(retenue.reference_date, d.reference_date)))}
                </span>
              </p>
            )}
            {d.note && <p className="historique-datations__doux">{d.note}</p>}
            <p className="historique-datations__doux">
              Notée le {formatDate(d.created_at)}
              {d.author_name ? ` par ${d.author_name}` : ''}
            </p>
          </div>
          {retenir && !d.is_current && (
            <Button
              variante="secondaire"
              chargement={occupe === d.id}
              disabled={!enLigne || (occupe !== null && occupe !== d.id)}
              onClick={() => retenir(d)}
            >
              Retenir cette datation
            </Button>
          )}
        </li>
      ))}
    </ol>
  )
}
