import { useState } from 'react'
import Button from '../../../../components/ui/Button/Button.jsx'
import Field from '../../../../components/ui/Field/Field.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import Modal from '../../../../components/ui/Modal/Modal.jsx'
import Textarea from '../../../../components/ui/Textarea/Textarea.jsx'
import { useBrouillon } from '../../../../hooks/useBrouillon.js'
import { useEnLigne } from '../../../../hooks/useEnLigne.js'
import { formatHeure, lireDateFr } from '../../../../lib/format.js'
import { enregistrerGroupeSanguin, ouvrirGrossesse } from '../../api.js'
import { DATATION_VIDE, verifierDatation, verifierObstetrique } from '../../grossesse.js'
import { erreurSousLaCase, premiereErreur } from '../../saisie.js'
import ChampsDatation from '../ChampsDatation/ChampsDatation.jsx'
import ChampsObstetrique from '../ChampsObstetrique/ChampsObstetrique.jsx'
import './ModaleOuvertureGrossesse.css'

const ID = 'ouverture-grossesse'
const VIDE = { ...DATATION_VIDE, gestite: '', parite: '', vivants: '', groupe: '', note: '' }

// Ouverture du suivi de grossesse depuis la fiche de la patiente. Brouillon sur l'appareil
// (coupures de courant), effacé après l'ouverture et à la déconnexion. Le groupe sanguin
// n'est envoyé que s'il est choisi : une case vide ne retire pas celui du dossier.
export default function ModaleOuvertureGrossesse({ patient, reglages, onFermer, onOuverte }) {
  const enLigne = useEnLigne()
  const brouillon = useBrouillon(`grossesse.ouverture.${patient.id}`, VIDE)
  const s = brouillon.valeur
  const [erreurs, setErreurs] = useState({})
  const [envoi, setEnvoi] = useState(false)
  const [echec, setEchec] = useState(null)
  const datation = verifierDatation(s, reglages, lireDateFr)

  function maj(champ, valeur) {
    brouillon.setValeur((p) => ({ ...p, [champ]: valeur }))
    setErreurs((e) => ({ ...e, [champ]: undefined }))
    setEchec(null)
  }

  async function surEnvoi(evenement) {
    evenement.preventDefault()
    const obstetrique = verifierObstetrique(s)
    const trouvees = { ...datation.erreurs, ...obstetrique.erreurs }
    setErreurs(trouvees)
    const premiere = premiereErreur(trouvees)
    if (premiere) {
      document.getElementById(`${ID}-${premiere}`)?.focus()
      return
    }
    setEnvoi(true)
    setEchec(null)
    let id = null
    try {
      id = await ouvrirGrossesse(patient.id, datation.valeur, obstetrique.valeur, s.note.trim())
      if (s.groupe) await enregistrerGroupeSanguin(patient.id, s.groupe)
      brouillon.effacer()
      onOuverte(id)
    } catch (e) {
      if (id) {
        // Suivi ouvert, groupe sanguin refusé : on n'ouvre pas une seconde grossesse.
        brouillon.effacer()
        onOuverte(id, `Suivi ouvert, mais le groupe sanguin n’a pas été enregistré : ${e.message}`)
        return
      }
      const champ = erreurSousLaCase(e.message, s.type)
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
      titre="Ouvrir un suivi de grossesse"
      description="La date prévue d’accouchement et le terme sont calculés d’après la datation."
      actions={
        <Button type="submit" form={ID} chargement={envoi} disabled={!enLigne}>
          Ouvrir le suivi
        </Button>
      }
    >
      <form id={ID} className="ouverture-grossesse" noValidate onSubmit={surEnvoi}>
        {brouillon.restaure && brouillon.enregistreLe && (
          <Message ton="info">
            <p>Votre saisie de {formatHeure(brouillon.enregistreLe)} a été retrouvée.</p>
          </Message>
        )}
        <ChampsDatation
          idBase={ID}
          saisie={s}
          maj={maj}
          erreurs={erreurs}
          apercu={datation.apercu}
        />
        <ChampsObstetrique
          idBase={ID}
          saisie={s}
          maj={maj}
          erreurs={erreurs}
          aideGroupe="Laissez vide pour garder celui du dossier."
        />
        <Field id={`${ID}-note`} label="Remarque" facultatif>
          <Textarea
            rows={2}
            maxLength={300}
            value={s.note}
            onChange={(e) => maj('note', e.target.value)}
          />
        </Field>
        {!enLigne && (
          <Message ton="info">
            <p>
              Pas de connexion : votre saisie reste sur cet appareil. Ouvrez le suivi au retour du
              réseau.
            </p>
          </Message>
        )}
        {echec && (
          <Message ton="erreur" titre="Le suivi n’a pas été ouvert">
            <p>{echec}</p>
            <p>Votre saisie est conservée sur cet appareil.</p>
          </Message>
        )}
      </form>
    </Modal>
  )
}
