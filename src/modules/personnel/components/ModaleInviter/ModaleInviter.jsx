import { Link2, Mail } from 'lucide-react'
import { useState } from 'react'
import Button from '../../../../components/ui/Button/Button.jsx'
import Field from '../../../../components/ui/Field/Field.jsx'
import Icone from '../../../../components/ui/Icone/Icone.jsx'
import Input from '../../../../components/ui/Input/Input.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import Modal from '../../../../components/ui/Modal/Modal.jsx'
import PhoneInput from '../../../../components/ui/PhoneInput/PhoneInput.jsx'
import Select from '../../../../components/ui/Select/Select.jsx'
import { estEmailValide } from '../../../../lib/motDePasse.js'
import { estTelephoneValide } from '../../../../lib/pays.js'
import { creerInvitation, envoyerParEmail } from '../../api.js'
import { rolesAttribuables } from '../../utils.js'
import EnvoiLien from '../EnvoiLien/EnvoiLien.jsx'
import './ModaleInviter.css'

const VIDE = { full_name: '', role: '', phone: '', email: '' }

function valider(f, parEmail) {
  const e = {}
  if (f.full_name.trim().length < 2) e.full_name = 'Saisissez le prénom et le nom.'
  if (!f.role) e.role = 'Choisissez un rôle.'
  if (f.phone && !estTelephoneValide(f.phone)) e.phone = 'Numéro incomplet.'
  if (parEmail && !f.email.trim()) e.email = 'Saisissez l’adresse e-mail.'
  else if (f.email.trim() && !estEmailValide(f.email)) e.email = 'Adresse e-mail non valide.'
  return e
}

// Nouvelle invitation : saisie courte, puis le lien à envoyer (WhatsApp d'abord).
// envoiInitial : ouvre directement l'écran du lien (invitation de l'assistant, nouveau lien).
export default function ModaleInviter({
  structure,
  roleUtilisateur,
  envoiInitial,
  onFermer,
  onCree,
}) {
  const [form, setForm] = useState(VIDE)
  const [erreurs, setErreurs] = useState({})
  const [envoi, setEnvoi] = useState(null)
  const [echec, setEchec] = useState(null)
  const [pret, setPret] = useState(envoiInitial ?? null)
  const [noteEmail, setNoteEmail] = useState(null)

  const champ = (nom) => (valeur) => setForm((f) => ({ ...f, [nom]: valeur }))

  async function creer(parEmail) {
    const trouvees = valider(form, parEmail)
    setErreurs(trouvees)
    const premiere = ['full_name', 'role', 'phone', 'email'].find((c) => trouvees[c])
    if (premiere) return document.getElementById(`inviter-${premiere}`)?.focus()

    setEnvoi(parEmail ? 'email' : 'lien')
    setEchec(null)
    const personne = { ...form, full_name: form.full_name.trim(), email: form.email.trim() }
    try {
      if (parEmail) {
        const r = await envoyerParEmail(structure.id, personne)
        setNoteEmail(r)
        setPret({ invitationId: r.invitation_id, lien: r.lien, expireLe: r.expires_at, personne })
      } else {
        const r = await creerInvitation(structure.id, personne, 'whatsapp')
        setPret({ invitationId: r.invitation_id, jeton: r.token, expireLe: r.expires_at, personne })
      }
      onCree?.()
    } catch (e) {
      // La saisie reste à l'écran.
      setEchec(e)
    } finally {
      setEnvoi(null)
    }
  }

  return (
    <Modal
      ouvert
      onFermer={onFermer}
      fermerSurVoile={!pret}
      titre={pret ? 'Envoyer l’invitation' : 'Inviter un membre'}
      description={
        pret ? null : 'Un lien personnel, valable 7 jours, à envoyer de préférence sur WhatsApp.'
      }
      actions={pret && <Button onClick={onFermer}>Terminé</Button>}
    >
      {pret ? (
        <>
          {noteEmail && (
            <Message ton={noteEmail.envoye ? 'succes' : 'info'} className="modale-inviter__note">
              <p>{noteEmail.message}</p>
            </Message>
          )}
          <EnvoiLien envoi={pret} structure={structure} onEnvoye={onCree} />
        </>
      ) : (
        <form
          className="modale-inviter"
          noValidate
          onSubmit={(e) => (e.preventDefault(), creer(false))}
        >
          {echec && (
            <Message ton="erreur" titre="Invitation non créée">
              <p>{echec.message}</p>
            </Message>
          )}
          <Field id="inviter-full_name" label="Prénom et nom" requis erreur={erreurs.full_name}>
            <Input
              autoComplete="off"
              value={form.full_name}
              onChange={(e) => champ('full_name')(e.target.value)}
            />
          </Field>
          <Field id="inviter-role" label="Rôle" requis erreur={erreurs.role}>
            <Select
              placeholder="Choisir un rôle"
              value={form.role}
              options={rolesAttribuables(roleUtilisateur, structure.type, { invitation: true })}
              onChange={(e) => champ('role')(e.target.value)}
            />
          </Field>
          <Field
            id="inviter-phone"
            label="Téléphone WhatsApp"
            facultatif
            aide="Le message s’ouvrira prêt à partir vers ce numéro."
            erreur={erreurs.phone}
          >
            <PhoneInput value={form.phone} onChange={champ('phone')} />
          </Field>
          <Field
            id="inviter-email"
            label="Adresse e-mail"
            facultatif
            aide="Envoi par e-mail : disponible quand le SMTP sera configuré."
            erreur={erreurs.email}
          >
            <Input
              type="email"
              inputMode="email"
              autoCapitalize="none"
              spellCheck={false}
              value={form.email}
              onChange={(e) => champ('email')(e.target.value)}
            />
          </Field>
          <div className="modale-inviter__actions">
            <Button
              type="submit"
              taille="grande"
              iconeDebut={<Icone icone={Link2} />}
              chargement={envoi === 'lien'}
              disabled={envoi === 'email'}
            >
              Créer le lien d’invitation
            </Button>
            <Button
              variante="secondaire"
              iconeDebut={<Icone icone={Mail} />}
              chargement={envoi === 'email'}
              disabled={envoi === 'lien'}
              onClick={() => creer(true)}
            >
              Envoyer par e-mail
            </Button>
          </div>
        </form>
      )}
    </Modal>
  )
}
