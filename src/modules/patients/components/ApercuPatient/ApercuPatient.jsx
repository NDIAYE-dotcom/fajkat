import { useQuery } from '@tanstack/react-query'
import Button from '../../../../components/ui/Button/Button.jsx'
import Drawer from '../../../../components/ui/Drawer/Drawer.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import Skeleton from '../../../../components/ui/Skeleton/Skeleton.jsx'
import { formatDate, formatTelephone } from '../../../../lib/format.js'
import { chargerPatient, cles } from '../../api.js'
import { libelleAge, libelleNaissance, libelleTitulaire, nomComplet } from '../../utils.js'
import './ApercuPatient.css'

function accordWhatsApp(patient) {
  if (patient.whatsapp_consent === true)
    return `Accepte (le ${formatDate(patient.whatsapp_consent_at)})`
  if (patient.whatsapp_consent === false)
    return `Refuse (le ${formatDate(patient.whatsapp_consent_at)})`
  return 'Non demandé'
}

// Aperçu en lecture seule de l'identité, en attendant la fiche patient complète.
export default function ApercuPatient({ patientId, orgId, onFermer }) {
  const requete = useQuery({
    queryKey: cles.patient(orgId, patientId),
    queryFn: () => chargerPatient(patientId),
  })
  const p = requete.data

  let corps
  if (requete.isPending) {
    corps = (
      <div className="apercu-patient__chargement" aria-busy="true">
        <Skeleton largeur="60%" />
        <Skeleton largeur="80%" />
        <Skeleton largeur="50%" />
      </div>
    )
  } else if (requete.error) {
    corps = (
      <Message
        ton="erreur"
        titre="Dossier non chargé"
        action={<Button onClick={() => requete.refetch()}>Réessayer</Button>}
      >
        <p>{requete.error.message}</p>
      </Message>
    )
  } else if (!p) {
    corps = (
      <Message ton="info" titre="Dossier introuvable">
        <p>Ce dossier n’existe pas dans cette structure, ou vous n’y avez pas accès.</p>
      </Message>
    )
  } else {
    const lignes = [
      ['Sexe', p.sex === 'F' ? 'Féminin' : 'Masculin'],
      ['Naissance', libelleNaissance(p)],
      ['Âge', libelleAge(p)],
      [
        'Téléphone',
        p.phone && (
          <>
            <span className="apercu-patient__chiffres">{formatTelephone(p.phone)}</span>
            {p.phone_owner && ` (${libelleTitulaire(p.phone_owner)})`}
          </>
        ),
      ],
      ['Quartier ou village', p.neighborhood],
      ['Commune', p.commune],
      ['Prénom de la mère', p.mother_first_name],
      ['Rappels WhatsApp', p.phone ? accordWhatsApp(p) : null],
      [
        'Ancien numéro',
        p.legacy_file_number && (
          <span className="apercu-patient__chiffres">{p.legacy_file_number}</span>
        ),
      ],
      ['Dossier ouvert le', formatDate(p.created_at)],
    ].filter(([, valeur]) => valeur)

    corps = (
      <div className="apercu-patient">
        {p.fusionneDepuis && (
          <Message ton="info">
            <p>Ce dossier a été fusionné : voici le dossier conservé.</p>
          </Message>
        )}
        <div className="apercu-patient__entete">
          <p className="apercu-patient__nom">{nomComplet(p)}</p>
          <p className="apercu-patient__numero">{p.file_number}</p>
        </div>
        <dl className="apercu-patient__liste">
          {lignes.map(([terme, valeur]) => (
            <div key={terme} className="apercu-patient__ligne">
              <dt className="apercu-patient__terme">{terme}</dt>
              <dd className="apercu-patient__valeur">{valeur}</dd>
            </div>
          ))}
        </dl>
        <p className="apercu-patient__note">
          La fiche complète du patient (couvertures, données médicales, historique) arrive avec la
          prochaine mise à jour du module.
        </p>
      </div>
    )
  }

  return (
    <Drawer ouvert onFermer={onFermer} titre="Dossier patient">
      {corps}
    </Drawer>
  )
}
