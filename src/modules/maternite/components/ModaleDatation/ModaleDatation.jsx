import { useState } from 'react'
import Button from '../../../../components/ui/Button/Button.jsx'
import Field from '../../../../components/ui/Field/Field.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import Modal from '../../../../components/ui/Modal/Modal.jsx'
import Textarea from '../../../../components/ui/Textarea/Textarea.jsx'
import { useEnLigne } from '../../../../hooks/useEnLigne.js'
import { lireDateFr } from '../../../../lib/format.js'
import { ajouterDatation } from '../../api.js'
import { DATATION_VIDE, verifierDatation } from '../../grossesse.js'
import { erreurSousLaCase, premiereErreur } from '../../saisie.js'
import ChampsDatation from '../ChampsDatation/ChampsDatation.jsx'
import './ModaleDatation.css'

const ID = 'nouvelle-datation'

// Nouvelle datation (échographie après la DDR…), retenue d'office ; les précédentes restent
// dans l'historique et peuvent être retenues de nouveau. Saisie courte, sans brouillon :
// en cas d'échec, elle reste dans la fenêtre.
export default function ModaleDatation({ grossesse, reglages, onFermer, onEnregistree }) {
  const enLigne = useEnLigne()
  const [s, setS] = useState({ ...DATATION_VIDE, type: 'ultrasound', note: '' })
  const [erreurs, setErreurs] = useState({})
  const [envoi, setEnvoi] = useState(false)
  const [echec, setEchec] = useState(null)
  const datation = verifierDatation(s, reglages, lireDateFr)

  function maj(champ, valeur) {
    setS((p) => ({ ...p, [champ]: valeur }))
    setErreurs((e) => ({ ...e, [champ]: undefined }))
    setEchec(null)
  }

  async function surEnvoi(evenement) {
    evenement.preventDefault()
    setErreurs(datation.erreurs)
    const premiere = premiereErreur(datation.erreurs)
    if (premiere) {
      document.getElementById(`${ID}-${premiere}`)?.focus()
      return
    }
    setEnvoi(true)
    setEchec(null)
    try {
      await ajouterDatation(grossesse.id, datation.valeur, s.note.trim())
      onEnregistree()
    } catch (e) {
      const champ = erreurSousLaCase(e.message, s.type)
      if (champ) setErreurs((x) => ({ ...x, [champ]: e.message }))
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
      titre="Nouvelle datation"
      description="Elle devient la datation retenue. Les précédentes restent dans l’historique."
      actions={
        <Button type="submit" form={ID} chargement={envoi} disabled={!enLigne}>
          Enregistrer la datation
        </Button>
      }
    >
      <form id={ID} className="modale-datation" noValidate onSubmit={surEnvoi}>
        <ChampsDatation
          idBase={ID}
          saisie={s}
          maj={maj}
          erreurs={erreurs}
          apercu={datation.apercu}
          termeRetenu={grossesse.ga_days}
        />
        <Field id={`${ID}-note`} label="Remarque" facultatif>
          <Textarea
            rows={2}
            maxLength={300}
            value={s.note}
            onChange={(e) => maj('note', e.target.value)}
          />
        </Field>
        {echec && (
          <Message ton="erreur" titre="Datation non enregistrée">
            <p>{echec}</p>
          </Message>
        )}
      </form>
    </Modal>
  )
}
