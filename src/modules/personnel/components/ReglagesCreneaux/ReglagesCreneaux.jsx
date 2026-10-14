import { useState } from 'react'
import Button from '../../../../components/ui/Button/Button.jsx'
import Checkbox from '../../../../components/ui/Checkbox/Checkbox.jsx'
import Field from '../../../../components/ui/Field/Field.jsx'
import Input from '../../../../components/ui/Input/Input.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import Modal from '../../../../components/ui/Modal/Modal.jsx'
import { useToast } from '../../../../hooks/useToast.js'
import { enregistrerCreneau } from '../../api.js'
import { heureCourte, horairesCreneau } from '../../utils.js'
import './ReglagesCreneaux.css'

const NOUVEAU = { label: '', start_time: '08:00', end_time: '14:00', is_active: true }

// Créneaux propres à la structure : nom et horaires modifiables, désactivation plutôt
// que suppression (les gardes passées gardent leur créneau).
export default function ReglagesCreneaux({ orgId, creneaux, onFermer, onChange }) {
  const prochainOrdre = Math.max(0, ...creneaux.map((c) => c.sort_order)) + 10
  return (
    <Modal
      ouvert
      onFermer={onFermer}
      titre="Créneaux et horaires"
      description="Une fin plus tôt que le début, ou égale, signifie que le créneau finit le lendemain."
      taille="large"
      actions={
        <Button variante="secondaire" onClick={onFermer}>
          Fermer
        </Button>
      }
    >
      <div className="reglages-creneaux">
        {creneaux.map((creneau) => (
          <LigneCreneau key={creneau.id} orgId={orgId} creneau={creneau} onChange={onChange} />
        ))}
        <LigneCreneau
          key={`nouveau-${prochainOrdre}`}
          orgId={orgId}
          creneau={{ ...NOUVEAU, sort_order: prochainOrdre }}
          onChange={onChange}
        />
      </div>
    </Modal>
  )
}

function LigneCreneau({ orgId, creneau, onChange }) {
  const toast = useToast()
  const nouveau = !creneau.id
  const [v, setV] = useState({
    ...creneau,
    start_time: heureCourte(creneau.start_time),
    end_time: heureCourte(creneau.end_time),
  })
  const [erreur, setErreur] = useState(null)
  const [envoi, setEnvoi] = useState(false)
  const id = (champ) => `creneau-${creneau.id ?? 'nouveau'}-${champ}`
  const maj = (champ) => (e) =>
    setV((p) => ({
      ...p,
      [champ]: e.target.type === 'checkbox' ? e.target.checked : e.target.value,
    }))

  async function enregistrer() {
    if (!v.label.trim()) {
      setErreur('Donnez un nom au créneau, par exemple « Matin ».')
      return document.getElementById(id('label'))?.focus()
    }
    if (!v.start_time || !v.end_time) {
      setErreur('Indiquez l’heure de début et l’heure de fin.')
      return
    }
    setEnvoi(true)
    setErreur(null)
    try {
      await enregistrerCreneau(orgId, v)
      toast.succes(nouveau ? `Créneau « ${v.label.trim()} » ajouté` : 'Créneau enregistré')
      onChange()
    } catch (e) {
      setErreur(e.message)
    } finally {
      setEnvoi(false)
    }
  }

  return (
    <fieldset className="reglages-creneaux__ligne">
      <legend className="reglages-creneaux__legende">
        {nouveau ? 'Nouveau créneau' : creneau.label}
        {!nouveau && (
          <span className="reglages-creneaux__horaires"> · {horairesCreneau(creneau)}</span>
        )}
      </legend>
      <div className="reglages-creneaux__champs">
        <Field id={id('label')} label="Nom">
          <Input value={v.label} maxLength={40} onChange={maj('label')} />
        </Field>
        <Field id={id('debut')} label="Début">
          <Input type="time" mono value={v.start_time} onChange={maj('start_time')} />
        </Field>
        <Field id={id('fin')} label="Fin">
          <Input type="time" mono value={v.end_time} onChange={maj('end_time')} />
        </Field>
      </div>
      <Checkbox
        label="Affiché dans le planning"
        checked={v.is_active}
        onChange={maj('is_active')}
      />
      {erreur && (
        <Message ton="erreur">
          <p>{erreur}</p>
        </Message>
      )}
      <div>
        <Button
          variante={nouveau ? 'primaire' : 'secondaire'}
          chargement={envoi}
          onClick={enregistrer}
        >
          {nouveau ? 'Ajouter le créneau' : 'Enregistrer'}
        </Button>
      </div>
    </fieldset>
  )
}
