import { Link, useLocation } from 'react-router-dom'
import Button from '../../../../components/ui/Button/Button.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import Skeleton from '../../../../components/ui/Skeleton/Skeleton.jsx'
import { formatHeure, formatIlYa } from '../../../../lib/format.js'
import { nomComplet } from '../../../patients/utils.js'
import { useMesBrouillons } from '../../hooks/useConsultation.js'
import { etatRetour } from '../../utils.js'
import './BrouillonsEnCours.css'

// Consultations commencées par l'utilisateur et pas encore validées (brouillons oubliés
// en fin de garde). Rien ne s'affiche s'il n'y en a aucune, sauf « vide » demandé.
export default function BrouillonsEnCours({ orgId, niveau = 2, vide = null }) {
  const brouillons = useMesBrouillons(orgId)
  const location = useLocation()
  const Titre = `h${niveau}`

  if (brouillons.isPending) return <Skeleton forme="bloc" hauteur="4rem" />
  if (brouillons.error) {
    return (
      <Message
        ton="erreur"
        action={<Button onClick={() => brouillons.refetch()}>Réessayer</Button>}
      >
        <p>{brouillons.error.message}</p>
      </Message>
    )
  }
  const liste = brouillons.data ?? []
  if (!liste.length) return vide

  return (
    <section className="brouillons-en-cours" aria-labelledby="brouillons-en-cours-titre">
      <Titre id="brouillons-en-cours-titre" className="brouillons-en-cours__titre">
        {`Vos consultations non validées (${liste.length})`}
      </Titre>
      <ul className="brouillons-en-cours__liste">
        {liste.map((b) => (
          <li key={b.encounter_id} className="brouillons-en-cours__ligne">
            <Link
              className="brouillons-en-cours__nom"
              to={`/app/consultations/${b.encounter_id}`}
              state={etatRetour(location)}
            >
              {nomComplet({ last_name: b.patient_last_name, first_name: b.patient_first_name })}
            </Link>
            {b.file_number && <span className="brouillons-en-cours__dossier">{b.file_number}</span>}
            <span>{b.type_label}</span>
            <span className="brouillons-en-cours__heure">
              {`commencée ${formatIlYa(b.started_at)}${
                b.updated_at && b.updated_at !== b.started_at
                  ? ` · enregistrée à ${formatHeure(b.updated_at)}`
                  : ''
              }`}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
