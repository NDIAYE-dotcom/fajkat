import { Phone } from 'lucide-react'
import { Link } from 'react-router-dom'
import Checkbox from '../../../../components/ui/Checkbox/Checkbox.jsx'
import Icone from '../../../../components/ui/Icone/Icone.jsx'
import Tampon from '../../../../components/ui/Tampon/Tampon.jsx'
import { formatHeure } from '../../../../lib/format.js'
import { nomComplet } from '../../../patients/utils.js'
import { libelleLangue, libelleTelephone, libelleTitulaires, messageRappel } from '../../suivi.js'
import './GroupeRappel.css'

// Un téléphone à appeler la veille, avec les rendez-vous de ceux qui le partagent (souvent
// une famille). « Rappel fait » vaut pour tout le téléphone ; « Confirmé par le patient »
// pour chaque rendez-vous. enCours : clé de la case en cours d'envoi.
export default function GroupeRappel({
  groupe,
  nomStructure,
  desactive,
  enCours,
  echec,
  onRappel,
  onConfirme,
}) {
  const fait = groupe.rdv.find((r) => r.reminder_done_at)
  const langues = groupe.langues.map(libelleLangue).filter(Boolean)

  return (
    <li className={groupe.fait ? 'groupe-rappel groupe-rappel--fait' : 'groupe-rappel'}>
      <div className="groupe-rappel__telephone">
        {groupe.telephone ? (
          <a className="groupe-rappel__numero" href={`tel:${groupe.telephone}`}>
            <Icone icone={Phone} />
            <span>{libelleTelephone(groupe)}</span>
          </a>
        ) : (
          <span className="groupe-rappel__numero">{libelleTelephone(groupe)}</span>
        )}
        {groupe.telephone && (
          <p className="groupe-rappel__infos">
            <span>{libelleTitulaires(groupe.titulaires)}</span>
            <span>{groupe.whatsapp ? 'Accepte WhatsApp' : 'Pas d’accord WhatsApp'}</span>
            {langues.length > 0 && <span>Langue : {langues.join(', ')}</span>}
          </p>
        )}
        {groupe.fait && <Tampon ton="primaire">Rappelé</Tampon>}
      </div>

      <ul className="groupe-rappel__rdv">
        {groupe.rdv.map((r) => (
          <li key={r.appointment_id} className="groupe-rappel__ligne">
            <p className="groupe-rappel__qui">
              <span className="groupe-rappel__heure">{formatHeure(r.starts_at)}</span>
              <Link
                className="groupe-rappel__nom"
                to={`/app/patients/${r.patient_id}?onglet=rendez-vous`}
              >
                {nomComplet({ last_name: r.patient_last_name, first_name: r.patient_first_name })}
              </Link>
              {r.file_number && <span className="groupe-rappel__dossier">{r.file_number}</span>}
              <span>{r.type_label ?? 'Consultation'}</span>
              {r.practitioner_name && <span>{r.practitioner_name}</span>}
            </p>
            <blockquote className="groupe-rappel__message">
              {messageRappel(r, nomStructure)}
            </blockquote>
            <Checkbox
              label="Confirmé par le patient"
              checked={r.status === 'confirmed'}
              disabled={desactive || enCours === `confirme:${r.appointment_id}`}
              onChange={(e) => onConfirme(r, e.target.checked)}
            />
          </li>
        ))}
      </ul>

      {groupe.telephone && (
        <Checkbox
          className="groupe-rappel__fait"
          label={groupe.rdv.length > 1 ? 'Rappel fait (pour tous)' : 'Rappel fait'}
          description={
            fait?.reminder_done_by_name
              ? `Par ${fait.reminder_done_by_name}, à ${formatHeure(fait.reminder_done_at)}`
              : undefined
          }
          checked={groupe.fait}
          disabled={desactive || enCours === `rappel:${groupe.cle}`}
          onChange={(e) => onRappel(groupe, e.target.checked)}
        />
      )}
      {echec && (
        <p className="groupe-rappel__echec" role="alert">
          {echec}
        </p>
      )}
    </li>
  )
}
