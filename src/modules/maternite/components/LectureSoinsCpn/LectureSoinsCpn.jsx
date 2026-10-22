import Button from '../../../../components/ui/Button/Button.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import Skeleton from '../../../../components/ui/Skeleton/Skeleton.jsx'
import { useSoinsConsultation } from '../../hooks/useMaternite.js'
import { libelleSoin } from '../../soins.js'
import './LectureSoinsCpn.css'

// Soins d'une CPN validée (soignants habilités) : soins faits, Td, conseils donnés, et
// situation de la grossesse cochée ou décochée ce jour-là (confidentielle : seulement ici).
export default function LectureSoinsCpn({ consultationId }) {
  const requete = useSoinsConsultation(consultationId, true)
  if (requete.isPending) return <Skeleton forme="bloc" hauteur="5rem" />
  if (requete.error) {
    return (
      <Message ton="erreur" action={<Button onClick={() => requete.refetch()}>Réessayer</Button>}>
        <p>{requete.error.message}</p>
      </Message>
    )
  }
  const g = requete.data?.given
  if (!g) return null
  const soins = g.interventions.map((i) => libelleSoin(i) + (i.note ? ` (${i.note})` : ''))
  const situations = [
    ...g.conditions_started.map((l) => `${l} : cochée ce jour`),
    ...g.conditions_ended.map((l) => `${l} : décochée ce jour`),
  ]
  return (
    <section className="lecture-soins-cpn" aria-labelledby="lecture-soins-cpn-titre">
      <h2 id="lecture-soins-cpn-titre" className="lecture-soins-cpn__titre">
        Soins de la CPN
      </h2>
      <dl className="lecture-soins-cpn__valeurs">
        <div>
          <dt>Soins faits</dt>
          <dd>
            {soins.length || g.td ? soins.join(' · ') : 'Aucun'}
            {g.td && (
              <>
                {soins.length ? ' · ' : ''}
                {g.td.dose_label}
                {g.td.lot_number && (
                  <>
                    {' · lot '}
                    <span className="lecture-soins-cpn__lot">{g.td.lot_number}</span>
                  </>
                )}
              </>
            )}
          </dd>
        </div>
        <div>
          <dt>Conseils donnés</dt>
          <dd>{g.counselling.length ? g.counselling.join(' · ') : 'Aucun'}</dd>
        </div>
        {situations.length > 0 && (
          <div className="lecture-soins-cpn__confidentiel">
            <dt>Situation de la grossesse (confidentiel)</dt>
            <dd>{situations.join(' · ')}</dd>
          </div>
        )}
      </dl>
    </section>
  )
}
