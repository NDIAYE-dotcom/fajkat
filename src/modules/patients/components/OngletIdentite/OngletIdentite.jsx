import { Pencil } from 'lucide-react'
import { useState } from 'react'
import Button from '../../../../components/ui/Button/Button.jsx'
import Icone from '../../../../components/ui/Icone/Icone.jsx'
import { useOrganization } from '../../../../hooks/useOrganization.js'
import { formatDate, formatTelephone } from '../../../../lib/format.js'
import { ETATS_CIVILS, LANGUES, libelleDe } from '../../fiche.js'
import { libelleAge, libelleNaissance, libelleTitulaire } from '../../utils.js'
import FormulaireIdentite from '../FormulaireIdentite/FormulaireIdentite.jsx'
import JournalIdentite from '../JournalIdentite/JournalIdentite.jsx'
import './OngletIdentite.css'

const chiffres = (v) => v && <span className="onglet-identite__chiffres">{v}</span>

function accordWhatsApp(p) {
  if (p.whatsapp_consent === true) return `Accepte (depuis le ${formatDate(p.whatsapp_consent_at)})`
  if (p.whatsapp_consent === false) return `Refuse (le ${formatDate(p.whatsapp_consent_at)})`
  return 'Non demandé'
}

function telephone(numero, titulaire) {
  if (!numero) return null
  return (
    <>
      {chiffres(formatTelephone(numero))}
      {titulaire && ` (${titulaire})`}
    </>
  )
}

// Identité en lecture (filets de registre), modification pour les rôles qui créent
// un patient, journal des modifications pour owner et admin.
export default function OngletIdentite({ patient: p, cle, ecrire }) {
  const { role } = useOrganization()
  const [edition, setEdition] = useState(false)

  if (edition) {
    return <FormulaireIdentite patient={p} cle={cle} onTermine={() => setEdition(false)} />
  }

  const urgence = [p.emergency_contact_name, p.emergency_contact_relation]
    .filter(Boolean)
    .join(', ')
  const lignes = [
    ['Nom', p.last_name],
    ['Prénom', p.first_name],
    ['Sexe', p.sex === 'F' ? 'Féminin' : 'Masculin'],
    [
      'Naissance',
      [libelleNaissance(p), libelleAge(p)].filter(Boolean).join(' · ') +
        (p.birth_date_estimated ? ' (date estimée d’après l’âge déclaré)' : ''),
    ],
    ['Téléphone', telephone(p.phone, libelleTitulaire(p.phone_owner, p.sex))],
    ['Second téléphone', telephone(p.phone_secondary)],
    ['Rappels WhatsApp', p.phone ? accordWhatsApp(p) : null],
    ['Quartier ou village', p.neighborhood],
    ['Commune', p.commune],
    ['Profession', p.occupation],
    ['Situation familiale', libelleDe(ETATS_CIVILS, p.marital_status)],
    ['Mère', [p.mother_first_name, p.mother_last_name].filter(Boolean).join(' ')],
    [
      'Personne à prévenir',
      (urgence || p.emergency_contact_phone) && (
        <>
          {urgence}
          {urgence && p.emergency_contact_phone && ' · '}
          {chiffres(formatTelephone(p.emergency_contact_phone))}
        </>
      ),
    ],
    ['Langue préférée', libelleDe(LANGUES, p.preferred_language)],
    ['Ancien n° de dossier', chiffres(p.legacy_file_number)],
    ['Dossier ouvert le', formatDate(p.created_at)],
  ]

  return (
    <div className="onglet-identite">
      {ecrire && (
        <div>
          <Button
            variante="secondaire"
            iconeDebut={<Icone icone={Pencil} />}
            onClick={() => setEdition(true)}
          >
            Modifier l’identité
          </Button>
        </div>
      )}
      <dl className="onglet-identite__liste">
        {lignes.map(([terme, valeur]) => (
          <div key={terme} className="onglet-identite__ligne">
            <dt className="onglet-identite__terme">{terme}</dt>
            <dd className="onglet-identite__valeur">
              {valeur || <span className="onglet-identite__vide">Non renseigné</span>}
            </dd>
          </div>
        ))}
      </dl>
      {['owner', 'admin'].includes(role) && <JournalIdentite patientId={p.id} />}
    </div>
  )
}
