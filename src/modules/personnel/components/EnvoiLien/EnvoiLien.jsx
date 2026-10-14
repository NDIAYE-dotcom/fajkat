import { Copy, Mail, MessageCircle } from 'lucide-react'
import { useState } from 'react'
import Button from '../../../../components/ui/Button/Button.jsx'
import Field from '../../../../components/ui/Field/Field.jsx'
import Icone from '../../../../components/ui/Icone/Icone.jsx'
import Input from '../../../../components/ui/Input/Input.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import { useToast } from '../../../../hooks/useToast.js'
import { formatDate, formatTelephone } from '../../../../lib/format.js'
import { envoyerParEmail } from '../../api.js'
import {
  copierTexte,
  lienInvitation,
  lienWhatsApp,
  messageInvitation,
  prenomDe,
} from '../../utils.js'
import './EnvoiLien.css'

// Lien d'invitation prêt à partir : WhatsApp d'abord, copie du lien, e-mail en option.
// envoi : { invitationId, jeton, expireLe, personne: { full_name, phone, email, role } }
// Le jeton n'existe qu'ici, en mémoire : une fois la fenêtre fermée, seul un nouveau
// lien peut être obtenu.
export default function EnvoiLien({ envoi, structure, onEnvoye }) {
  const toast = useToast()
  const [courant, setCourant] = useState(envoi)
  const [email, setEmail] = useState({ etat: 'repos', resultat: null, erreur: null })
  const { personne } = courant
  const lien = courant.lien ?? lienInvitation(courant.jeton)
  const message = messageInvitation({
    prenom: prenomDe(personne.full_name),
    structure: structure.name,
    role: personne.role,
    lien,
    expireLe: courant.expireLe,
  })

  async function copier() {
    if (await copierTexte(lien)) toast.succes('Lien copié')
    else toast.erreur('Le lien n’a pas pu être copié', { message: 'Sélectionnez-le à la main.' })
  }

  // Envoi par e-mail : un nouveau lien remplace celui affiché (le jeton n'est jamais relu).
  async function envoyerEmail() {
    setEmail({ etat: 'envoi', resultat: null, erreur: null })
    try {
      const resultat = await envoyerParEmail(structure.id, { invitation_id: courant.invitationId })
      setCourant((c) => ({ ...c, lien: resultat.lien, expireLe: resultat.expires_at }))
      setEmail({ etat: 'fait', resultat, erreur: null })
      onEnvoye?.()
    } catch (erreur) {
      setEmail({ etat: 'repos', resultat: null, erreur })
    }
  }

  return (
    <div className="envoi-lien">
      <p className="envoi-lien__intro">
        Lien personnel pour <strong>{personne.full_name}</strong>, à usage unique, valable jusqu’au{' '}
        <span className="envoi-lien__date">{formatDate(courant.expireLe)}</span>.
      </p>

      <Field id="envoi-lien-adresse" label="Lien d’invitation">
        <Input
          readOnly
          value={lien}
          className="envoi-lien__adresse"
          onFocus={(e) => e.target.select()}
        />
      </Field>

      <div className="envoi-lien__actions">
        <Button
          href={lienWhatsApp(personne.phone, message)}
          target="_blank"
          rel="noopener noreferrer"
          taille="grande"
          iconeDebut={<Icone icone={MessageCircle} />}
          onClick={() => onEnvoye?.()}
        >
          Envoyer sur WhatsApp
        </Button>
        <Button variante="secondaire" iconeDebut={<Icone icone={Copy} />} onClick={copier}>
          Copier le lien
        </Button>
      </div>
      <p className="envoi-lien__aide">
        {personne.phone
          ? `WhatsApp s’ouvre avec le message prêt pour le ${formatTelephone(personne.phone)}.`
          : 'Aucun numéro noté : WhatsApp vous demandera à qui envoyer le message.'}
      </p>

      {personne.email && (
        <div className="envoi-lien__email">
          <Button
            variante="discret"
            iconeDebut={<Icone icone={Mail} />}
            chargement={email.etat === 'envoi'}
            onClick={envoyerEmail}
          >
            Envoyer aussi par e-mail à {personne.email}
          </Button>
          <p className="envoi-lien__aide">
            Un nouveau lien remplace alors celui-ci. L’envoi par e-mail fonctionnera quand le SMTP
            sera configuré.
          </p>
        </div>
      )}

      {email.erreur && (
        <Message ton="erreur" titre="E-mail non envoyé">
          <p>{email.erreur.message}</p>
        </Message>
      )}
      {email.resultat && (
        <Message ton={email.resultat.envoye ? 'succes' : 'info'}>
          <p>{email.resultat.message}</p>
        </Message>
      )}
    </div>
  )
}
