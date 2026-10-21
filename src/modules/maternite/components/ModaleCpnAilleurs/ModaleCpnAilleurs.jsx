import { useState } from 'react'
import Button from '../../../../components/ui/Button/Button.jsx'
import DateInput from '../../../../components/ui/DateInput/DateInput.jsx'
import Field from '../../../../components/ui/Field/Field.jsx'
import Input from '../../../../components/ui/Input/Input.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import Modal from '../../../../components/ui/Modal/Modal.jsx'
import Textarea from '../../../../components/ui/Textarea/Textarea.jsx'
import { useBrouillon } from '../../../../hooks/useBrouillon.js'
import { useEnLigne } from '../../../../hooks/useEnLigne.js'
import { formatHeure, lireDateFr } from '../../../../lib/format.js'
import { noterCpnAilleurs } from '../../api.js'
import { NOTE_MAX } from '../../cpn.js'
import { aujourdhuiStructure } from '../../grossesse.js'
import './ModaleCpnAilleurs.css'

const ID = 'cpn-ailleurs'
const VIDE = { date: '', lieu: '', note: '' }
const date = (texte) => ({ type: 'date', date: lireDateFr(texte), texte })

// Refus de la base rangé sous sa case.
function caseDuMessage(message) {
  if (/où la CPN|^Lieu/.test(message)) return 'lieu'
  if (/^Remarque/.test(message)) return 'note'
  if (/date|\d SA /.test(message)) return 'date'
  return null
}

// CPN faite ailleurs, notée d'après le carnet : date, lieu, remarque. Elle compte comme
// faite et prend son numéro dans l'ordre des dates. Brouillon sur l'appareil.
export default function ModaleCpnAilleurs({ grossesseId, onFermer, onNotee }) {
  const enLigne = useEnLigne()
  const brouillon = useBrouillon(`cpn.ailleurs.${grossesseId}`, VIDE)
  const s = brouillon.valeur
  const [erreurs, setErreurs] = useState({})
  const [envoi, setEnvoi] = useState(false)
  const [echec, setEchec] = useState(null)

  function maj(champ, valeur) {
    brouillon.setValeur((p) => ({ ...p, [champ]: valeur }))
    setErreurs((e) => ({ ...e, [champ]: undefined }))
    setEchec(null)
  }

  async function envoyer(evenement) {
    evenement.preventDefault()
    const jour = lireDateFr(s.date)
    const trouvees = {}
    if (!s.date) trouvees.date = 'Indiquez la date de la CPN, d’après le carnet.'
    else if (!jour) trouvees.date = 'Date incomplète ou inexistante : JJ/MM/AAAA.'
    else if (jour > aujourdhuiStructure())
      trouvees.date = 'La date de la CPN ne peut pas être dans le futur.'
    if (s.lieu.trim().length < 2) trouvees.lieu = 'Indiquez où la CPN a été faite.'
    setErreurs(trouvees)
    const premiere = ['date', 'lieu'].find((c) => trouvees[c])
    if (premiere) {
      document.getElementById(`${ID}-${premiere}`)?.focus()
      return
    }
    setEnvoi(true)
    setEchec(null)
    try {
      await noterCpnAilleurs(grossesseId, jour, s.lieu.trim(), s.note.trim())
      brouillon.effacer()
      onNotee()
    } catch (e) {
      const champ = caseDuMessage(e.message)
      if (champ) {
        setErreurs((x) => ({ ...x, [champ]: e.message }))
        document.getElementById(`${ID}-${champ}`)?.focus()
      } else {
        setEchec(e.message)
      }
    } finally {
      setEnvoi(false)
    }
  }

  return (
    <Modal
      ouvert
      onFermer={onFermer}
      fermerSurVoile={false}
      titre="Noter une CPN faite ailleurs"
      description="D’après le carnet de la patiente. Elle compte comme faite et prend son numéro dans l’ordre des dates."
      actions={
        <Button type="submit" form={ID} chargement={envoi} disabled={!enLigne}>
          Noter la CPN
        </Button>
      }
    >
      <form id={ID} className="cpn-ailleurs" noValidate onSubmit={envoyer}>
        {brouillon.restaure && brouillon.enregistreLe && (
          <Message ton="info">
            <p>Votre saisie de {formatHeure(brouillon.enregistreLe)} a été retrouvée.</p>
          </Message>
        )}
        <Field id={`${ID}-date`} label="Date de la CPN" requis erreur={erreurs.date}>
          <DateInput value={date(s.date)} onChange={(d) => maj('date', d.texte)} />
        </Field>
        <Field
          id={`${ID}-lieu`}
          label="Lieu"
          requis
          erreur={erreurs.lieu}
          aide="Exemple : Centre de santé de Kolda."
        >
          <Input maxLength={120} value={s.lieu} onChange={(e) => maj('lieu', e.target.value)} />
        </Field>
        <Field id={`${ID}-note`} label="Remarque" facultatif erreur={erreurs.note}>
          <Textarea
            rows={2}
            maxLength={NOTE_MAX}
            value={s.note}
            onChange={(e) => maj('note', e.target.value)}
          />
        </Field>
        {!enLigne && (
          <Message ton="info">
            <p>Pas de connexion : votre saisie reste sur cet appareil.</p>
          </Message>
        )}
        {echec && (
          <Message ton="erreur" titre="La CPN n’a pas été notée">
            <p>{echec}</p>
            <p>Votre saisie est conservée sur cet appareil.</p>
          </Message>
        )}
      </form>
    </Modal>
  )
}
