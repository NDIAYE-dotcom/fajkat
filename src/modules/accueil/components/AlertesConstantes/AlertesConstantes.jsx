import Tampon from '../../../../components/ui/Tampon/Tampon.jsx'
import './AlertesConstantes.css'

// Alertes d'une mesure en tampons : rouge pour une alerte, encre pour « à surveiller ».
// Le libellé est toujours écrit (la couleur ne porte jamais seule l'information).
export default function AlertesConstantes({ alertes, className = '' }) {
  if (!alertes?.length) return null
  return (
    <span className={`alertes-constantes ${className}`.trim()}>
      {alertes.map((a) => (
        <Tampon
          key={`${a.measure}-${a.direction}-${a.label}`}
          ton={a.level === 'alert' ? 'alerte' : 'encre'}
        >
          {a.label}
        </Tampon>
      ))}
    </span>
  )
}
