import { useState } from 'react'
import Button from '../../../../components/ui/Button/Button.jsx'
import DateInput from '../../../../components/ui/DateInput/DateInput.jsx'
import Field from '../../../../components/ui/Field/Field.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import Select from '../../../../components/ui/Select/Select.jsx'
import Textarea from '../../../../components/ui/Textarea/Textarea.jsx'
import { useBrouillon } from '../../../../hooks/useBrouillon.js'
import { formatHeure, lireDateFr } from '../../../../lib/format.js'
import { demanderConge } from '../../api.js'
import { TYPES_CONGE } from '../../utils.js'
import ConflitsGardes from '../ConflitsGardes/ConflitsGardes.jsx'
import './FormulaireConge.css'

const VIDE = { type: '', debut: '', fin: '', motif: '' }

// Demande de congé ou d'absence par le membre. Motif facultatif, et jamais pour un congé
// maladie : seuls le type et les dates sont nécessaires (secret médical).
export default function FormulaireConge({ orgId, membreId, onEnvoye }) {
  const brouillon = useBrouillon(`personnel.conge.${orgId}`, VIDE)
  const v = brouillon.valeur
  const [erreurs, setErreurs] = useState({})
  const [envoi, setEnvoi] = useState(false)
  const [echec, setEchec] = useState(null)
  const debut = lireDateFr(v.debut)
  const fin = lireDateFr(v.fin)
  const maladie = v.type === 'maladie'

  function maj(champ, valeur) {
    brouillon.setValeur((p) => ({ ...p, [champ]: valeur }))
    setErreurs((e) => ({ ...e, [champ]: undefined }))
  }

  async function surEnvoi(evenement) {
    evenement.preventDefault()
    const trouvees = {}
    if (!v.type) trouvees.type = 'Choisissez le type d’absence.'
    if (!debut) trouvees.debut = 'Date incomplète : JJ/MM/AAAA, par exemple 03/11/2026.'
    if (!fin) trouvees.fin = 'Date incomplète : JJ/MM/AAAA, par exemple 05/11/2026.'
    else if (debut && fin < debut)
      trouvees.fin = 'La fin doit être le même jour que le début, ou après.'
    setErreurs(trouvees)
    const premiere = ['type', 'debut', 'fin'].find((c) => trouvees[c])
    if (premiere) return document.getElementById(`conge-${premiere}`)?.focus()
    setEnvoi(true)
    setEchec(null)
    try {
      await demanderConge(orgId, membreId, { type: v.type, debut, fin, motif: v.motif })
      brouillon.effacer()
      onEnvoye()
    } catch (e) {
      setEchec(e.message)
    } finally {
      setEnvoi(false)
    }
  }

  return (
    <form className="formulaire-conge" noValidate onSubmit={surEnvoi}>
      {brouillon.restaure && brouillon.enregistreLe && (
        <Message ton="info">
          <p>Votre saisie de {formatHeure(brouillon.enregistreLe)} a été retrouvée.</p>
          <Button variante="discret" onClick={brouillon.effacer}>
            Effacer la saisie
          </Button>
        </Message>
      )}
      <Field id="conge-type" label="Type d’absence" requis erreur={erreurs.type}>
        <Select
          value={v.type}
          placeholder="Choisir"
          options={TYPES_CONGE}
          onChange={(e) => maj('type', e.target.value)}
        />
      </Field>
      <div className="formulaire-conge__dates">
        <Field id="conge-debut" label="Premier jour" requis erreur={erreurs.debut}>
          <DateInput
            value={{ type: 'date', date: debut, texte: v.debut }}
            onChange={(valeur) => maj('debut', valeur.texte)}
          />
        </Field>
        <Field id="conge-fin" label="Dernier jour" requis erreur={erreurs.fin}>
          <DateInput
            value={{ type: 'date', date: fin, texte: v.fin }}
            onChange={(valeur) => maj('fin', valeur.texte)}
          />
        </Field>
      </div>
      {maladie ? (
        <p className="formulaire-conge__note">
          Pour un congé maladie, seuls le type et les dates sont nécessaires. N’indiquez aucun
          diagnostic.
        </p>
      ) : (
        <Field
          id="conge-motif"
          label="Motif"
          facultatif
          aide="N’indiquez aucun diagnostic médical."
        >
          <Textarea
            rows={3}
            maxLength={500}
            value={v.motif}
            onChange={(e) => maj('motif', e.target.value)}
          />
        </Field>
      )}
      <ConflitsGardes orgId={orgId} membreId={membreId} debut={debut} fin={fin} vous />
      {echec && (
        <Message ton="erreur" titre="Demande non envoyée">
          <p>{echec}</p>
          <p>Votre saisie est conservée sur cet appareil.</p>
        </Message>
      )}
      <div>
        <Button type="submit" chargement={envoi}>
          Envoyer la demande
        </Button>
      </div>
    </form>
  )
}
