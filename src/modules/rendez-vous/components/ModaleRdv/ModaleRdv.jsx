import Button from '../../../../components/ui/Button/Button.jsx'
import Modal from '../../../../components/ui/Modal/Modal.jsx'
import Tampon from '../../../../components/ui/Tampon/Tampon.jsx'
import { formatHeure } from '../../../../lib/format.js'
import { nomComplet } from '../../../patients/utils.js'
import { ageOuNaissance, STATUTS_RDV } from '../../agenda.js'
import { dateLongue } from '../../utils.js'
import './ModaleRdv.css'

// Statuts où le rendez-vous peut encore être reporté, ou changer de type (comme la base).
const REPORTABLES = ['scheduled', 'confirmed', 'no_show']
const TYPE_MODIFIABLE = ['scheduled', 'confirmed']

// Détail d'un rendez-vous de l'agenda, avec ce que le rôle peut en faire. Le type affiché
// est celui que la base renvoie (neutre pour un type discret que le rôle ne voit pas).
export default function ModaleRdv({ rdv, droits, onFermer, onReporter, onChangerType }) {
  const statut = STATUTS_RDV[rdv.status]
  const reportable = droits.write && REPORTABLES.includes(rdv.status)
  const typeModifiable = droits.write && droits.medical && TYPE_MODIFIABLE.includes(rdv.status)
  const nom = nomComplet({ last_name: rdv.patient_last_name, first_name: rdv.patient_first_name })
  const lignes = [
    ['Quand', `${dateLongue(rdv.local_date)}, ${formatHeure(rdv.starts_at)}`],
    ['Type', rdv.type_label ?? 'Consultation'],
    rdv.practitioner_name && ['Praticien', rdv.practitioner_name],
    rdv.series_index && ['Série', `Rendez-vous n° ${rdv.series_index}`],
    rdv.note && ['Note', rdv.note],
  ].filter(Boolean)

  return (
    <Modal
      ouvert
      onFermer={onFermer}
      titre="Rendez-vous"
      description={nom}
      actions={
        (typeModifiable || reportable) && (
          <>
            {typeModifiable && (
              <Button variante="secondaire" onClick={onChangerType}>
                Changer le type
              </Button>
            )}
            {reportable && <Button onClick={onReporter}>Reporter</Button>}
          </>
        )
      }
    >
      <div className="modale-rdv">
        <p className="modale-rdv__identite">
          {rdv.file_number && <span className="modale-rdv__dossier">{rdv.file_number}</span>}
          {ageOuNaissance(rdv) && <span>{ageOuNaissance(rdv)}</span>}
          {statut && <Tampon ton={statut.ton}>{statut.libelle}</Tampon>}
        </p>
        <dl className="modale-rdv__details">
          {lignes.map(([terme, valeur]) => (
            <div key={terme} className="modale-rdv__ligne">
              <dt>{terme}</dt>
              <dd>{valeur}</dd>
            </div>
          ))}
        </dl>
        <Button variante="discret" to={`/app/patients/${rdv.patient_id}`}>
          Ouvrir le dossier du patient
        </Button>
      </div>
    </Modal>
  )
}
