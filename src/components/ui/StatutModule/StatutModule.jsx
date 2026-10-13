import { STATUTS_MODULE } from '../../../lib/offres.js'
import './StatutModule.css'

// Pastille d'état d'un module : « Disponible » (pleine) ou « Prévu » (pointillés).
export default function StatutModule({ statut }) {
  const infos = STATUTS_MODULE[statut]
  if (!infos) return null
  return (
    <span className={`statut-module statut-module--${statut}`}>
      <span className="sr-only">Statut : </span>
      {infos.libelle}
    </span>
  )
}
