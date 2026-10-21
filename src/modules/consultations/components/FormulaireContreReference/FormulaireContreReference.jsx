import dayjs from 'dayjs'
import { useState } from 'react'
import DateInput from '../../../../components/ui/DateInput/DateInput.jsx'
import Field from '../../../../components/ui/Field/Field.jsx'
import Input from '../../../../components/ui/Input/Input.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import Textarea from '../../../../components/ui/Textarea/Textarea.jsx'
import { useBrouillon } from '../../../../hooks/useBrouillon.js'
import { formatDate, getFuseauHoraire } from '../../../../lib/format.js'
import BrouillonRetrouve from '../../../accueil/components/BrouillonRetrouve/BrouillonRetrouve.jsx'
import { versDateInput } from '../../../rendez-vous/utils.js'
import { enregistrerContreReference } from '../../api.js'
import { LIMITES_CONTRE } from '../../documents.js'
import './FormulaireContreReference.css'

const CHAMPS = [
  { cle: 'diagnostic', libelle: 'Diagnostic retenu', lignes: 2 },
  { cle: 'traitement', libelle: 'Traitement', lignes: 3 },
  { cle: 'conduite', libelle: 'Conduite à tenir', lignes: 3 },
  { cle: 'suivi', libelle: 'Suivi', lignes: 2 },
]

// Contre-référence rapportée par le patient (coupon de la lettre) : saisie une seule fois.
// Brouillon automatique ; formulaire envoyé par le bouton de la fenêtre (id).
//   reference : get_referral ; onEnregistree() : relire la liste.
export default function FormulaireContreReference({ id, reference, onEnvoi, onEnregistree }) {
  const aujourdhui = dayjs().tz(getFuseauHoraire()).format('YYYY-MM-DD')
  const jourReference = dayjs(reference.referred_at).tz(getFuseauHoraire()).format('YYYY-MM-DD')
  const [initial] = useState(() => ({
    date: versDateInput(aujourdhui),
    structure: reference.destination_name,
    diagnostic: '',
    traitement: '',
    conduite: '',
    suivi: '',
  }))
  const brouillon = useBrouillon(`reference.${reference.id}.contre`, initial)
  const v = brouillon.valeur
  const [erreurs, setErreurs] = useState({})
  const [echec, setEchec] = useState(null)

  function maj(champ, valeur) {
    brouillon.setValeur((p) => ({ ...p, [champ]: valeur }))
    setErreurs((e) => ({ ...e, [champ]: undefined, contenu: undefined }))
    setEchec(null)
  }

  function verifier() {
    const e = {}
    const d = v.date?.date
    if (!d) e.date = 'Tapez la date de la contre-référence (JJ/MM/AAAA).'
    else if (d > aujourdhui) e.date = 'La date ne peut pas être dans le futur.'
    else if (d < jourReference)
      e.date = `La référence date du ${formatDate(reference.referred_at)}.`
    if (CHAMPS.every((c) => !v[c.cle].trim())) {
      e.contenu =
        'Remplissez au moins le diagnostic retenu, le traitement, la conduite à tenir ou le suivi.'
    }
    return e
  }

  async function envoyer(evenement) {
    evenement.preventDefault()
    const trouvees = verifier()
    setErreurs(trouvees)
    if (Object.keys(trouvees).length) return
    onEnvoi(true)
    try {
      await enregistrerContreReference(reference.id, {
        date: v.date.date,
        structure: v.structure.trim(),
        diagnostic: v.diagnostic.trim(),
        traitement: v.traitement.trim(),
        conduite: v.conduite.trim(),
        suivi: v.suivi.trim(),
      })
      brouillon.effacer()
      onEnregistree()
    } catch (e) {
      setEchec(e.message)
    } finally {
      onEnvoi(false)
    }
  }

  return (
    <form id={id} className="formulaire-contre-reference" noValidate onSubmit={envoyer}>
      <BrouillonRetrouve brouillon={brouillon} onEffacer={() => setErreurs({})} />
      <div className="formulaire-contre-reference__ligne">
        <Field label="Date de la contre-référence" requis erreur={erreurs.date}>
          <DateInput value={v.date} onChange={(d) => maj('date', d)} />
        </Field>
        <Field label="Structure qui a reçu le patient">
          <Input
            value={v.structure}
            maxLength={LIMITES_CONTRE.structure}
            onChange={(e) => maj('structure', e.target.value)}
          />
        </Field>
      </div>
      {CHAMPS.map((c) => (
        <Field key={c.cle} label={c.libelle}>
          <Textarea
            rows={c.lignes}
            maxLength={LIMITES_CONTRE[c.cle]}
            value={v[c.cle]}
            onChange={(e) => maj(c.cle, e.target.value)}
          />
        </Field>
      ))}
      {erreurs.contenu && (
        <Message ton="erreur">
          <p>{erreurs.contenu}</p>
        </Message>
      )}
      {echec && (
        <Message ton="erreur" titre="Contre-référence non enregistrée">
          <p>{echec}</p>
          <p>Votre saisie est conservée sur cet appareil.</p>
        </Message>
      )}
    </form>
  )
}
