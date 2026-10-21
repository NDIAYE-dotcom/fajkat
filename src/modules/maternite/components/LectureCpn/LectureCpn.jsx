import Button from '../../../../components/ui/Button/Button.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import Skeleton from '../../../../components/ui/Skeleton/Skeleton.jsx'
import { formatHauteur, libelleBcf } from '../../cpn.js'
import { useCpnConsultation } from '../../hooks/useMaternite.js'
import RepereCpn from '../RepereCpn/RepereCpn.jsx'
import './LectureCpn.css'

// CPN d'une consultation validée : repères et mesures enregistrées (libellés du jour).
export default function LectureCpn({ consultationId }) {
  const cpn = useCpnConsultation(consultationId, true)
  if (cpn.isPending) return <Skeleton forme="bloc" hauteur="6rem" />
  if (cpn.error) {
    return (
      <Message ton="erreur" action={<Button onClick={() => cpn.refetch()}>Réessayer</Button>}>
        <p>{cpn.error.message}</p>
      </Message>
    )
  }
  const v = cpn.data.visit
  if (!v || !cpn.data.pregnancy) return null
  const lignes = [
    ['Hauteur utérine', formatHauteur(v.fundal_height_cm), true],
    ['Bruits du cœur fœtal', libelleBcf(v.fetal_heart_heard, v.fetal_heart_rate)],
    ['Présentation', v.presentation ?? '—'],
    ['Œdèmes', v.oedema ?? '—'],
    ['Protéinurie', v.proteinuria ?? '—'],
    ['Glycosurie', v.glycosuria ?? '—'],
  ]
  return (
    <section className="lecture-cpn" aria-labelledby="lecture-cpn-titre">
      <h2 id="lecture-cpn-titre" className="lecture-cpn__titre">
        CPN
      </h2>
      <RepereCpn cpn={cpn.data} />
      <dl className="lecture-cpn__valeurs">
        {lignes.map(([titre, valeur, chiffres]) => (
          <div key={titre}>
            <dt>{titre}</dt>
            <dd className={chiffres ? 'lecture-cpn__chiffres' : undefined}>{valeur}</dd>
          </div>
        ))}
      </dl>
      {v.note && <p className="lecture-cpn__note">{v.note}</p>}
    </section>
  )
}
