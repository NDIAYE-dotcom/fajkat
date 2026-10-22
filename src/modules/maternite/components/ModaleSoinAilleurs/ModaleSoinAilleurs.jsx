import { useState } from 'react'
import Button from '../../../../components/ui/Button/Button.jsx'
import DateInput from '../../../../components/ui/DateInput/DateInput.jsx'
import Field from '../../../../components/ui/Field/Field.jsx'
import Input from '../../../../components/ui/Input/Input.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import Modal from '../../../../components/ui/Modal/Modal.jsx'
import Select from '../../../../components/ui/Select/Select.jsx'
import { useBrouillon } from '../../../../hooks/useBrouillon.js'
import { useEnLigne } from '../../../../hooks/useEnLigne.js'
import { formatHeure, lireDateFr } from '../../../../lib/format.js'
import { noterSoinAilleurs, nouvelIdentifiant } from '../../api.js'
import { aujourdhuiStructure } from '../../grossesse.js'
import './ModaleSoinAilleurs.css'

const ID = 'soin-ailleurs'

// Soin fait ailleurs, d'après le carnet : SP datée (elle prend son numéro dans l'ordre des
// dates), moustiquaire déjà reçue (une case, date facultative : l'écran arrête de la
// proposer). types : soins de la grossesse qui se notent « faits ailleurs ».
export default function ModaleSoinAilleurs({ grossesseId, types, onFermer, onNote }) {
  const enLigne = useEnLigne()
  const brouillon = useBrouillon(`soin.ailleurs.${grossesseId}`, {
    identifiant: nouvelIdentifiant(),
    type: types[0]?.type_id ?? '',
    date: '',
    lieu: '',
  })
  const s = brouillon.valeur
  const type = types.find((t) => t.type_id === s.type)
  const [erreurs, setErreurs] = useState({})
  const [envoi, setEnvoi] = useState(false)
  const [echec, setEchec] = useState(null)

  function maj(champ, valeur) {
    brouillon.setValeur((p) => ({ ...p, [champ]: valeur }))
    setErreurs({})
    setEchec(null)
  }

  async function envoyer(evenement) {
    evenement.preventDefault()
    const jour = lireDateFr(s.date)
    const trouvees = {}
    if (!type) trouvees.type = 'Choisissez le soin.'
    else if (!s.date && type.elsewhere_dated) trouvees.date = 'Indiquez la date, d’après le carnet.'
    else if (s.date && !jour) trouvees.date = 'Date incomplète ou inexistante : JJ/MM/AAAA.'
    else if (jour && jour > aujourdhuiStructure())
      trouvees.date = 'La date ne peut pas être dans le futur.'
    setErreurs(trouvees)
    if (Object.keys(trouvees).length) return
    setEnvoi(true)
    try {
      await noterSoinAilleurs(grossesseId, type.type_id, jour, s.lieu.trim(), null, s.identifiant)
      brouillon.effacer()
      onNote()
    } catch (e) {
      if (/date|grossesse/i.test(e.message)) setErreurs({ date: e.message })
      else setEchec(e.message)
    } finally {
      setEnvoi(false)
    }
  }

  return (
    <Modal
      ouvert
      onFermer={onFermer}
      fermerSurVoile={false}
      titre="Noter un soin fait ailleurs"
      description="D’après le carnet de la patiente."
      actions={
        <Button type="submit" form={ID} chargement={envoi} disabled={!enLigne}>
          Noter le soin
        </Button>
      }
    >
      <form id={ID} className="soin-ailleurs" noValidate onSubmit={envoyer}>
        {brouillon.restaure && brouillon.enregistreLe && (
          <Message ton="info">
            <p>Votre saisie de {formatHeure(brouillon.enregistreLe)} a été retrouvée.</p>
          </Message>
        )}
        <Field id={`${ID}-type`} label="Soin" requis erreur={erreurs.type}>
          <Select
            value={s.type}
            options={types.map((t) => ({ valeur: t.type_id, libelle: t.label }))}
            onChange={(e) => maj('type', e.target.value)}
          />
        </Field>
        <Field
          id={`${ID}-date`}
          label="Date"
          requis={Boolean(type?.elsewhere_dated)}
          facultatif={!type?.elsewhere_dated}
          aide={type?.elsewhere_dated ? undefined : 'Laissez vide si le carnet ne la donne pas.'}
          erreur={erreurs.date}
        >
          <DateInput
            value={{ type: 'date', date: lireDateFr(s.date), texte: s.date }}
            onChange={(d) => maj('date', d.texte)}
          />
        </Field>
        <Field id={`${ID}-lieu`} label="Lieu" facultatif aide="Exemple : Poste de santé de Saré.">
          <Input maxLength={120} value={s.lieu} onChange={(e) => maj('lieu', e.target.value)} />
        </Field>
        {!enLigne && (
          <Message ton="info">
            <p>Pas de connexion : votre saisie reste sur cet appareil.</p>
          </Message>
        )}
        {echec && (
          <Message ton="erreur" titre="Le soin n’a pas été noté">
            <p>{echec}</p>
            <p>Votre saisie est conservée sur cet appareil.</p>
          </Message>
        )}
      </form>
    </Modal>
  )
}
