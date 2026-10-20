import { ArrowLeft } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import Button from '../../../../components/ui/Button/Button.jsx'
import Icone from '../../../../components/ui/Icone/Icone.jsx'
import Tampon from '../../../../components/ui/Tampon/Tampon.jsx'
import { formatDateHeure } from '../../../../lib/format.js'
import { libelleAge, nomComplet } from '../../../patients/utils.js'
import { retourConsultation } from '../../utils.js'
import './EnTeteConsultation.css'

// En-tête : retour vers la page d'où l'on vient (file d'attente, Consultations, fiche du
// patient, Journée du jour), patient, type, statut. enfants : choix du type et indicateur
// d'enregistrement.
export default function EnTeteConsultation({ consultation: c, patient, sensible, children }) {
  const location = useLocation()
  const retour = retourConsultation(c, location.state?.retour)
  const details = patient
    ? [patient.sex === 'F' ? 'Féminin' : 'Masculin', libelleAge(patient)]
        .filter(Boolean)
        .join(' · ')
    : ''

  return (
    <header className="en-tete-consultation">
      <Button variante="discret" to={retour.to} iconeDebut={<Icone icone={ArrowLeft} />}>
        {retour.libelle}
      </Button>
      <div className="en-tete-consultation__identite">
        {patient?.file_number && (
          <p className="en-tete-consultation__numero">{patient.file_number}</p>
        )}
        <h1 className="en-tete-consultation__nom">
          {patient ? nomComplet(patient) : 'Consultation'}
        </h1>
        {details && <p className="en-tete-consultation__details">{details}</p>}
      </div>
      <p className="en-tete-consultation__statut">
        <span>
          {c.status === 'validated'
            ? `${c.type_label} · validée le ${formatDateHeure(c.validated_at)} par ${c.validated_by_name}`
            : `${c.type_label} · commencée le ${formatDateHeure(c.started_at)}`}
        </span>
        {c.status === 'validated' && <Tampon ton="primaire">Validée</Tampon>}
        {sensible && <Tampon ton="alerte">Sensible</Tampon>}
      </p>
      {children}
    </header>
  )
}
