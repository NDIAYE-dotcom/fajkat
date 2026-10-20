import { useState } from 'react'
import Button from '../../../../components/ui/Button/Button.jsx'
import Field from '../../../../components/ui/Field/Field.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import Modal from '../../../../components/ui/Modal/Modal.jsx'
import Textarea from '../../../../components/ui/Textarea/Textarea.jsx'
import { useEnLigne } from '../../../../hooks/useEnLigne.js'
import './ModaleAvenant.css'

// Avenant : correction datée d'une consultation validée, avec son auteur. Il s'ajoute à la
// suite ; il ne se modifie ni ne se retire. En cas d'échec, le texte reste dans la case.
export default function ModaleAvenant({ ouvert, onFermer, onEnvoyer }) {
  const enLigne = useEnLigne()
  const [texte, setTexte] = useState('')
  const [erreur, setErreur] = useState(null)
  const [echec, setEchec] = useState(null)
  const [envoi, setEnvoi] = useState(false)

  async function envoyer(e) {
    e.preventDefault()
    if (!texte.trim()) {
      setErreur('Écrivez le texte de l’avenant.')
      return
    }
    setEnvoi(true)
    setEchec(null)
    try {
      await onEnvoyer(texte.trim())
      setTexte('')
      onFermer()
    } catch (err) {
      setEchec(err.message)
    } finally {
      setEnvoi(false)
    }
  }

  return (
    <Modal
      ouvert={ouvert}
      onFermer={onFermer}
      titre="Ajouter un avenant"
      description="L’avenant est daté et signé de votre nom. Il ne pourra plus être modifié."
    >
      <form className="modale-avenant" onSubmit={envoyer} noValidate>
        <Field label="Texte de l’avenant" requis erreur={erreur}>
          <Textarea
            rows={5}
            maxLength={4000}
            value={texte}
            onChange={(e) => {
              setTexte(e.target.value)
              setErreur(null)
            }}
          />
        </Field>
        {!enLigne && (
          <Message ton="info">
            <p>
              Pas de connexion : votre texte reste dans la case, envoyez-le au retour du réseau.
            </p>
          </Message>
        )}
        {echec && (
          <Message ton="erreur">
            <p>{echec}</p>
          </Message>
        )}
        <div className="modale-avenant__actions">
          <Button variante="discret" onClick={onFermer}>
            Annuler
          </Button>
          <Button type="submit" chargement={envoi} disabled={!enLigne}>
            Ajouter l’avenant
          </Button>
        </div>
      </form>
    </Modal>
  )
}
