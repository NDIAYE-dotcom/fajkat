import { formatDate } from '../../../../lib/format.js'
import { formatPoids, formatTension, prochaineCpn, resumeBilan, texteProchaine } from '../../cpn.js'
import { aujourdhuiStructure, formatSA } from '../../grossesse.js'
import { useModelesCpn } from '../../hooks/useMaternite.js'
import './RepereCpn.css'

// Repères d'une CPN (réponse de get_encounter_anc) : numéro, terme du jour, DPA, poids et
// tension pris aux constantes du passage (jamais ressaisis), bilan des CPN et prochaine
// (en brouillon : en comptant cette CPN, que la base ne compte qu'à la validation).
export default function RepereCpn({ cpn }) {
  const modeles = useModelesCpn()
  const g = cpn.pregnancy
  const v = cpn.vitals ?? {}
  const prochaine = texteProchaine(prochaineCpn(cpn, modeles.data, aujourdhuiStructure()))
  return (
    <div className="repere-cpn">
      <dl className="repere-cpn__valeurs">
        <div>
          <dt>CPN</dt>
          <dd className="repere-cpn__numero">n° {cpn.anc_number ?? '—'}</dd>
        </div>
        <div>
          <dt>Terme {cpn.visit ? 'ce jour-là' : 'aujourd’hui'}</dt>
          <dd className="repere-cpn__chiffres">{formatSA(g.ga_days) || '—'}</dd>
        </div>
        <div>
          <dt>Date prévue d’accouchement</dt>
          <dd className="repere-cpn__chiffres">{formatDate(g.edd) || '—'}</dd>
        </div>
        <div>
          <dt>Poids (constantes du passage)</dt>
          <dd className="repere-cpn__chiffres">{formatPoids(v.weight_kg)}</dd>
        </div>
        <div>
          <dt>Tension (constantes du passage)</dt>
          <dd className="repere-cpn__chiffres">{formatTension(v.systolic, v.diastolic)}</dd>
        </div>
      </dl>
      {cpn.status && (
        <p className="repere-cpn__bilan">
          {cpn.status.model_label} : {resumeBilan(cpn.status)}.
          {prochaine && <> Ensuite : {prochaine}</>}
        </p>
      )}
    </div>
  )
}
