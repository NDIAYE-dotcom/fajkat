import Skeleton from '../../../../components/ui/Skeleton/Skeleton.jsx'
import { formatFCFA } from '../../../../lib/format.js'
import { libellePaiement } from '../../utils.js'
import './BilanTickets.css'

function tickets(n) {
  return `${n} ticket${n > 1 ? 's' : ''}`
}

// Bilan du jour : tickets payants et montant encaissé (par mode de paiement), tickets
// gratuits comptés à part, par motif, avec leur valeur (tarif du jour, non encaissé).
// bilan : réponse de consultation_tickets_summary.
export default function BilanTickets({ bilan, chargement }) {
  if (chargement) return <Skeleton forme="bloc" hauteur="7rem" />
  if (!bilan) return null
  const payants = Number(bilan.paid_count ?? 0)
  const gratuits = Number(bilan.free_count ?? 0)

  return (
    <section className="bilan-tickets" aria-label="Bilan du jour">
      <div className="bilan-tickets__bloc">
        <h2 className="bilan-tickets__titre">Payants</h2>
        <p className="bilan-tickets__chiffre">{formatFCFA(bilan.paid_amount ?? 0)}</p>
        <p className="bilan-tickets__detail">{tickets(payants)}</p>
        {bilan.by_method?.length > 0 && (
          <ul className="bilan-tickets__liste">
            {bilan.by_method.map((m) => (
              <li key={m.method}>
                <span>{libellePaiement(m.method)}</span>
                <span className="bilan-tickets__nombre">
                  {m.count} · {formatFCFA(m.amount)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="bilan-tickets__bloc">
        <h2 className="bilan-tickets__titre">Gratuits</h2>
        <p className="bilan-tickets__chiffre">{tickets(gratuits)}</p>
        <p className="bilan-tickets__detail">
          valeur {formatFCFA(bilan.free_value ?? 0)}, non encaissée
        </p>
        {bilan.free_by_reason?.length > 0 && (
          <ul className="bilan-tickets__liste">
            {bilan.free_by_reason.map((m) => (
              <li key={m.reason_id ?? m.label}>
                <span>{m.label}</span>
                <span className="bilan-tickets__nombre">
                  {m.count} · {formatFCFA(m.value ?? 0)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
