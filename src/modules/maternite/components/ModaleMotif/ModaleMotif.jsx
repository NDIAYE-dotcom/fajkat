import { useId, useState } from 'react'
import Button from '../../../../components/ui/Button/Button.jsx'
import Field from '../../../../components/ui/Field/Field.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import Modal from '../../../../components/ui/Modal/Modal.jsx'
import Textarea from '../../../../components/ui/Textarea/Textarea.jsx'
import { useEnLigne } from '../../../../hooks/useEnLigne.js'
import './ModaleMotif.css'

// Retrait ou annulation motivée (soin fait ailleurs, dose de vaccin, résultat extérieur) :
// rien n'est effacé, le journal du dossier garde la ligne et son motif.
//   onConfirmer(motif) : promesse ; son refus s'affiche sous le formulaire, motif gardé.
export default function ModaleMotif({ titre, texte, action, aideMotif, onFermer, onConfirmer }) {
  const id = `motif-${useId()}`
  const enLigne = useEnLigne()
  const [motif, setMotif] = useState('')
  const [erreur, setErreur] = useState(null)
  const [envoi, setEnvoi] = useState(false)
  const [echec, setEchec] = useState(null)

  async function confirmer() {
    if (motif.trim().length < 3) {
      setErreur(aideMotif ?? 'Indiquez le motif (3 caractères au moins).')
      document.getElementById(id)?.focus()
      return
    }
    setEnvoi(true)
    setEchec(null)
    try {
      await onConfirmer(motif.trim())
    } catch (e) {
      setEchec(e.message)
    } finally {
      setEnvoi(false)
    }
  }

  return (
    <Modal
      ouvert
      onFermer={onFermer}
      fermerSurVoile={false}
      titre={titre}
      actions={
        <>
          <Button variante="secondaire" onClick={onFermer} disabled={envoi}>
            Garder
          </Button>
          <Button chargement={envoi} disabled={!enLigne} onClick={confirmer}>
            {action}
          </Button>
        </>
      }
    >
      <div className="modale-motif">
        {texte && <p>{texte}</p>}
        <Field id={id} label="Motif" requis erreur={erreur}>
          <Textarea
            rows={2}
            maxLength={300}
            value={motif}
            onChange={(e) => {
              setMotif(e.target.value)
              setErreur(null)
            }}
          />
        </Field>
        {!enLigne && (
          <Message ton="info">
            <p>Pas de connexion : réessayez au retour du réseau.</p>
          </Message>
        )}
        {echec && (
          <Message ton="erreur" titre="Rien n’a été modifié">
            <p>{echec}</p>
          </Message>
        )}
      </div>
    </Modal>
  )
}
