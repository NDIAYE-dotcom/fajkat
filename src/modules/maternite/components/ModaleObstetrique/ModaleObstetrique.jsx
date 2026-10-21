import { useState } from 'react'
import Button from '../../../../components/ui/Button/Button.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import Modal from '../../../../components/ui/Modal/Modal.jsx'
import { useEnLigne } from '../../../../hooks/useEnLigne.js'
import { corrigerObstetrique, enregistrerGroupeSanguin } from '../../api.js'
import { verifierObstetrique } from '../../grossesse.js'
import { erreurSousLaCase, premiereErreur } from '../../saisie.js'
import ChampsObstetrique from '../ChampsObstetrique/ChampsObstetrique.jsx'
import './ModaleObstetrique.css'

const ID = 'obstetrique'

// Correction de la gestité, de la parité, des enfants vivants et du groupe sanguin.
// Seules les valeurs changées sont envoyées.
export default function ModaleObstetrique({ grossesse, onFermer, onEnregistre }) {
  const enLigne = useEnLigne()
  const [s, setS] = useState({
    gestite: String(grossesse.gravidity),
    parite: String(grossesse.parity),
    vivants: String(grossesse.living_children),
    groupe: grossesse.blood_group ?? '',
  })
  const [erreurs, setErreurs] = useState({})
  const [envoi, setEnvoi] = useState(false)
  const [echec, setEchec] = useState(null)

  function maj(champ, valeur) {
    setS((p) => ({ ...p, [champ]: valeur }))
    setErreurs((e) => ({ ...e, [champ]: undefined }))
    setEchec(null)
  }

  async function surEnvoi(evenement) {
    evenement.preventDefault()
    const { erreurs: trouvees, valeur } = verifierObstetrique(s)
    setErreurs(trouvees)
    const premiere = premiereErreur(trouvees)
    if (premiere) {
      document.getElementById(`${ID}-${premiere}`)?.focus()
      return
    }
    setEnvoi(true)
    setEchec(null)
    try {
      if (
        valeur.gravidity !== grossesse.gravidity ||
        valeur.parity !== grossesse.parity ||
        valeur.living !== grossesse.living_children
      ) {
        await corrigerObstetrique(grossesse.id, valeur)
      }
      if (s.groupe !== (grossesse.blood_group ?? '')) {
        await enregistrerGroupeSanguin(grossesse.patient_id, s.groupe)
      }
      onEnregistre()
    } catch (e) {
      const champ = erreurSousLaCase(e.message)
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
      titre="Gestité, parité et groupe sanguin"
      actions={
        <Button type="submit" form={ID} chargement={envoi} disabled={!enLigne}>
          Enregistrer
        </Button>
      }
    >
      <form id={ID} className="modale-obstetrique" noValidate onSubmit={surEnvoi}>
        <ChampsObstetrique
          idBase={ID}
          saisie={s}
          maj={maj}
          erreurs={erreurs}
          aideGroupe="Le groupe sanguin est celui de la fiche médicale du dossier."
        />
        {echec && (
          <Message ton="erreur" titre="Modifications non enregistrées">
            <p>{echec}</p>
          </Message>
        )}
      </form>
    </Modal>
  )
}
