import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import Button from '../../../../components/ui/Button/Button.jsx'
import Field from '../../../../components/ui/Field/Field.jsx'
import Input from '../../../../components/ui/Input/Input.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import Modal from '../../../../components/ui/Modal/Modal.jsx'
import Skeleton from '../../../../components/ui/Skeleton/Skeleton.jsx'
import { useEnLigne } from '../../../../hooks/useEnLigne.js'
import { cles, renommerService } from '../../api.js'
import { useServicesFile } from '../../hooks/useFile.js'
import './ModaleFiles.css'

// Noms des files d'attente (owner et admin). Le nom est lu à l'accueil et sur les tickets
// des arrivées du jour : il ne doit pas révéler un soin (la file « Sage-femme » reçoit la
// CPN, la planification familiale et la consultation postnatale). La lettre ne change pas.
export default function ModaleFiles({ orgId, onFermer }) {
  const queryClient = useQueryClient()
  const enLigne = useEnLigne()
  const services = useServicesFile(orgId)
  const [edition, setEdition] = useState(null) // { id, libelle }
  const [occupe, setOccupe] = useState(false)
  const [erreur, setErreur] = useState(null)
  const liste = services.data ?? []

  async function renommer(evenement) {
    evenement.preventDefault()
    const libelle = edition.libelle.trim()
    if (libelle.length < 2) {
      setErreur('Le nom doit compter de 2 à 60 caractères.')
      return
    }
    setOccupe(true)
    setErreur(null)
    try {
      await renommerService(edition.id, libelle)
      await queryClient.invalidateQueries({ queryKey: cles.services(orgId) })
      queryClient.invalidateQueries({ queryKey: cles.tableau(orgId) })
      setEdition(null)
    } catch (e) {
      setErreur(e.message)
    } finally {
      setOccupe(false)
    }
  }

  return (
    <Modal
      ouvert
      onFermer={onFermer}
      titre="Noms des files"
      description="Choisissez des noms qui ne révèlent pas le soin : ils s’affichent à l’accueil."
      actions={
        <Button variante="secondaire" onClick={onFermer}>
          Fermer
        </Button>
      }
    >
      <div className="modale-files">
        {services.error && (
          <Message
            ton="erreur"
            action={<Button onClick={() => services.refetch()}>Réessayer</Button>}
          >
            <p>{services.error.message}</p>
          </Message>
        )}
        {services.isPending && <Skeleton forme="bloc" hauteur="10rem" />}
        {erreur && (
          <Message ton="erreur">
            <p>{erreur}</p>
          </Message>
        )}
        <ul className="modale-files__liste">
          {liste.map((s) => (
            <li key={s.id} className="modale-files__ligne">
              {edition?.id === s.id ? (
                <form className="modale-files__edition" onSubmit={renommer}>
                  <Field label={`Nouveau nom pour « ${s.label} »`}>
                    <Input
                      value={edition.libelle}
                      maxLength={60}
                      autoFocus
                      onChange={(e) => setEdition({ id: s.id, libelle: e.target.value })}
                    />
                  </Field>
                  <div className="modale-files__boutons">
                    <Button variante="discret" onClick={() => setEdition(null)}>
                      Annuler
                    </Button>
                    <Button type="submit" chargement={occupe} disabled={!enLigne}>
                      Enregistrer
                    </Button>
                  </div>
                </form>
              ) : (
                <>
                  <span className="modale-files__nom">
                    <span className="modale-files__lettre">{s.letter}</span> {s.label}
                  </span>
                  <Button
                    variante="discret"
                    disabled={!enLigne || occupe}
                    aria-label={`Renommer la file ${s.label}`}
                    onClick={() => {
                      setErreur(null)
                      setEdition({ id: s.id, libelle: s.label })
                    }}
                  >
                    Renommer
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
        {!enLigne && (
          <Message ton="info" titre="Vous êtes hors ligne">
            <p>Renommez une file dès le retour de la connexion.</p>
          </Message>
        )}
      </div>
    </Modal>
  )
}
