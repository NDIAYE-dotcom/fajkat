import { useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import Button from '../../../../components/ui/Button/Button.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import Modal from '../../../../components/ui/Modal/Modal.jsx'
import { useBrouillon } from '../../../../hooks/useBrouillon.js'
import { useEnLigne } from '../../../../hooks/useEnLigne.js'
import { formatHeure } from '../../../../lib/format.js'
import { creerPatient } from '../../api.js'
import { useDoublons } from '../../hooks/useDoublons.js'
import { ORDRE_CHAMPS, SAISIE_VIDE, saisieVersPatient, validerSaisie } from '../../utils.js'
import AlerteDoublons from '../AlerteDoublons/AlerteDoublons.jsx'
import ChampsIdentite from '../ChampsIdentite/ChampsIdentite.jsx'
import './ModaleNouveauPatient.css'

const ID = 'nouveau-patient'

// Création rapide d'un patient : l'identité seulement, le reste viendra dans la fiche.
// Brouillon automatique (coupures de courant), effacé après une création réussie.
// Les doublons sont cherchés quand on quitte un champ, et de nouveau avant l'envoi.
export default function ModaleNouveauPatient({ orgId, ouvert, onFermer, onCree, onOuvrir }) {
  const queryClient = useQueryClient()
  const enLigne = useEnLigne()
  const brouillon = useBrouillon(`patients.nouveau.${orgId}`, SAISIE_VIDE)
  const v = brouillon.valeur
  const [erreurs, setErreurs] = useState({})
  const [envoi, setEnvoi] = useState(false)
  const [echec, setEchec] = useState(null)
  const doublons = useDoublons(orgId, v, ouvert)
  const alerte = useRef(null)

  function maj(champ, valeur) {
    brouillon.setValeur((p) => ({ ...p, [champ]: valeur }))
    setErreurs((e) => ({ ...e, [champ]: undefined }))
    setEchec(null)
  }

  async function surEnvoi(evenement) {
    evenement.preventDefault()
    const trouvees = validerSaisie(v)
    setErreurs(trouvees)
    const premiere = ORDRE_CHAMPS.find((c) => trouvees[c])
    if (premiere) {
      document.getElementById(`${ID}-${premiere}`)?.focus()
      return
    }
    setEnvoi(true)
    setEchec(null)
    try {
      if (await doublons.bloquants()) {
        setEchec('doublons')
        requestAnimationFrame(() => alerte.current?.focus())
        return
      }
      const patient = await creerPatient(orgId, saisieVersPatient(v))
      brouillon.effacer()
      doublons.reinitialiser()
      queryClient.invalidateQueries({ queryKey: ['patients', 'recherche', orgId] })
      onCree(patient)
    } catch (e) {
      setEchec(e.message)
    } finally {
      setEnvoi(false)
    }
  }

  return (
    <Modal
      ouvert={ouvert}
      onFermer={onFermer}
      taille="large"
      fermerSurVoile={false}
      titre="Nouveau patient"
      description="L’identité suffit pour ouvrir le dossier. Le numéro est attribué à l’enregistrement."
      actions={
        <Button type="submit" form={ID} chargement={envoi} disabled={!enLigne}>
          Créer le dossier
        </Button>
      }
    >
      <form
        id={ID}
        className="nouveau-patient"
        noValidate
        onSubmit={surEnvoi}
        onBlur={doublons.actualiser}
      >
        {brouillon.restaure && brouillon.enregistreLe && (
          <Message ton="info">
            <p>Votre saisie de {formatHeure(brouillon.enregistreLe)} a été retrouvée.</p>
            <Button
              variante="discret"
              onClick={() => {
                brouillon.effacer()
                setErreurs({})
                doublons.reinitialiser()
              }}
            >
              Effacer la saisie
            </Button>
          </Message>
        )}

        <ChampsIdentite id={ID} saisie={v} erreurs={erreurs} onChange={maj} />

        <AlerteDoublons
          ref={alerte}
          candidats={doublons.candidats}
          confirme={doublons.confirme}
          onConfirmer={(oui) => {
            doublons.confirmer(oui)
            if (echec === 'doublons') setEchec(null)
          }}
          onOuvrir={onOuvrir}
        />

        {!enLigne && (
          <Message ton="info" titre="Vous êtes hors ligne">
            <p>
              La saisie est gardée sur cet appareil. Créez le dossier dès le retour de la connexion.
            </p>
          </Message>
        )}
        {echec === 'doublons' && (
          <Message ton="erreur" titre="Vérifiez d’abord les dossiers proches">
            <p>
              Ouvrez le bon dossier, ou cochez « c’est une autre personne » pour créer un nouveau
              dossier.
            </p>
          </Message>
        )}
        {echec && echec !== 'doublons' && (
          <Message ton="erreur" titre="Dossier non créé">
            <p>{echec}</p>
            <p>Votre saisie est conservée sur cet appareil.</p>
          </Message>
        )}
      </form>
    </Modal>
  )
}
