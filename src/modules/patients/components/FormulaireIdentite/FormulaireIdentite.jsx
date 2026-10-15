import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import Button from '../../../../components/ui/Button/Button.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import { useBrouillon } from '../../../../hooks/useBrouillon.js'
import { useEnLigne } from '../../../../hooks/useEnLigne.js'
import { useToast } from '../../../../hooks/useToast.js'
import { formatHeure } from '../../../../lib/format.js'
import { cles, modifierPatient } from '../../api.js'
import {
  modificationsDe,
  ORDRE_CHAMPS_FICHE,
  patientVersSaisie,
  validerFiche,
} from '../../fiche.js'
import ChampsComplementaires from '../ChampsComplementaires/ChampsComplementaires.jsx'
import ChampsIdentite from '../ChampsIdentite/ChampsIdentite.jsx'
import './FormulaireIdentite.css'

const ID = 'identite-patient'

// Modification de l'identité, avec brouillon automatique (effacé après l'enregistrement
// ou l'abandon). Seuls les champs changés sont envoyés ; la base journalise chaque
// modification (auteur, date, ancienne et nouvelle valeur).
export default function FormulaireIdentite({ patient, cle, onTermine }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const enLigne = useEnLigne()
  const brouillon = useBrouillon(`patients.identite.${patient.id}`, patientVersSaisie(patient))
  const v = brouillon.valeur
  const [erreurs, setErreurs] = useState({})
  const [envoi, setEnvoi] = useState(false)
  const [echec, setEchec] = useState(null)

  function maj(champ, valeur) {
    brouillon.setValeur((p) => ({ ...p, [champ]: valeur }))
    setErreurs((e) => ({ ...e, [champ]: undefined }))
    setEchec(null)
  }

  function abandonner() {
    brouillon.effacer()
    onTermine()
  }

  async function surEnvoi(evenement) {
    evenement.preventDefault()
    const trouvees = validerFiche(v)
    setErreurs(trouvees)
    const premiere = ORDRE_CHAMPS_FICHE.find((c) => trouvees[c])
    if (premiere) {
      document.getElementById(`${ID}-${premiere}`)?.focus()
      return
    }
    const champs = modificationsDe(v, patient)
    if (Object.keys(champs).length === 0) {
      toast.info('Aucune modification à enregistrer')
      abandonner()
      return
    }
    setEnvoi(true)
    setEchec(null)
    try {
      const misAJour = await modifierPatient(patient.id, champs)
      queryClient.setQueryData(cle, (ancien) => ({ ...ancien, ...misAJour }))
      queryClient.invalidateQueries({ queryKey: ['patients', 'recherche', patient.org_id] })
      queryClient.invalidateQueries({ queryKey: cles.journal(patient.id) })
      brouillon.effacer()
      toast.succes('Identité enregistrée')
      onTermine()
    } catch (e) {
      setEchec(e.message)
    } finally {
      setEnvoi(false)
    }
  }

  return (
    <form id={ID} className="formulaire-identite" noValidate onSubmit={surEnvoi}>
      {brouillon.restaure && brouillon.enregistreLe && (
        <Message ton="info">
          <p>Votre saisie de {formatHeure(brouillon.enregistreLe)} a été retrouvée.</p>
        </Message>
      )}
      <ChampsIdentite id={ID} saisie={v} erreurs={erreurs} onChange={maj} />
      <ChampsComplementaires id={ID} saisie={v} erreurs={erreurs} onChange={maj} />
      {!enLigne && (
        <Message ton="info" titre="Vous êtes hors ligne">
          <p>La saisie est gardée sur cet appareil. Enregistrez dès le retour de la connexion.</p>
        </Message>
      )}
      {echec && (
        <Message ton="erreur" titre="Modification non enregistrée">
          <p>{echec}</p>
          <p>Votre saisie est conservée sur cet appareil.</p>
        </Message>
      )}
      <div className="formulaire-identite__actions">
        <Button variante="secondaire" onClick={abandonner} disabled={envoi}>
          Annuler les modifications
        </Button>
        <Button type="submit" chargement={envoi} disabled={!enLigne}>
          Enregistrer
        </Button>
      </div>
    </form>
  )
}
