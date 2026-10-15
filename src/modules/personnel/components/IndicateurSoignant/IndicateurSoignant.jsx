import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import Button from '../../../../components/ui/Button/Button.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import Modal from '../../../../components/ui/Modal/Modal.jsx'
import Switch from '../../../../components/ui/Switch/Switch.jsx'
import { useAuth } from '../../../../hooks/useAuth.js'
import { useEnLigne } from '../../../../hooks/useEnLigne.js'
import { useToast } from '../../../../hooks/useToast.js'
import { definirSoignant } from '../../api.js'
import './IndicateurSoignant.css'

// « Exerce une profession soignante » : un propriétaire ou un administrateur qui soigne
// (ICP propriétaire du poste, médecin directeur de la clinique) accède alors aux données
// médicales des patients. Réglé par le propriétaire seulement, après confirmation ;
// chaque changement est journalisé par la base.
export default function IndicateurSoignant({ orgId, membre, onModifie }) {
  const { utilisateur } = useAuth()
  const queryClient = useQueryClient()
  const toast = useToast()
  const enLigne = useEnLigne()
  const [actif, setActif] = useState(Boolean(membre.is_clinician))
  const [demande, setDemande] = useState(null)
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState(null)
  const nom = membre.profil?.full_name || 'ce membre'
  const vous = membre.user_id === utilisateur?.id

  async function confirmer() {
    setEnvoi(true)
    setErreur(null)
    try {
      await definirSoignant(membre.id, demande)
      setActif(demande)
      setDemande(null)
      // Les droits sur le registre des patients changent (onglet Médical).
      queryClient.invalidateQueries({ queryKey: ['patients', 'permissions', orgId] })
      toast.succes(
        demande ? 'Accès aux données médicales activé' : 'Accès aux données médicales retiré',
      )
      onModifie()
    } catch (e) {
      setErreur(e.message)
    } finally {
      setEnvoi(false)
    }
  }

  const qui = vous ? 'Vous' : nom
  return (
    <div className="indicateur-soignant">
      <Switch
        label="Exerce une profession soignante"
        description="Donne accès aux données médicales des patients (allergies, antécédents, y compris sensibles)."
        checked={actif}
        disabled={!enLigne}
        onChange={(e) => {
          setErreur(null)
          setDemande(e.target.checked)
        }}
      />
      {demande !== null && (
        <Modal
          ouvert
          onFermer={() => setDemande(null)}
          titre={
            demande
              ? 'Donner accès aux données médicales ?'
              : 'Retirer l’accès aux données médicales ?'
          }
          actions={
            <>
              <Button variante="secondaire" onClick={() => setDemande(null)} disabled={envoi}>
                Annuler
              </Button>
              <Button onClick={confirmer} chargement={envoi}>
                {demande ? 'Oui, donner l’accès' : 'Oui, retirer l’accès'}
              </Button>
            </>
          }
        >
          <div className="indicateur-soignant__confirmation">
            {demande ? (
              <p>
                {qui} {vous ? 'pourrez' : 'pourra'} lire et modifier les données médicales des
                patients, y compris les antécédents sensibles (VIH / PTME, santé mentale). Chaque
                lecture sensible est journalisée. Activez ce réglage seulement pour une personne qui
                soigne.
              </p>
            ) : (
              <p>
                {qui} ne {vous ? 'pourrez' : 'pourra'} plus ouvrir l’onglet Médical des patients.
              </p>
            )}
            {erreur && <Message ton="erreur">{erreur}</Message>}
          </div>
        </Modal>
      )}
    </div>
  )
}
