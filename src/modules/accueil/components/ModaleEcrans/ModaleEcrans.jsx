import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import Button from '../../../../components/ui/Button/Button.jsx'
import Checkbox from '../../../../components/ui/Checkbox/Checkbox.jsx'
import Field from '../../../../components/ui/Field/Field.jsx'
import Input from '../../../../components/ui/Input/Input.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import Modal from '../../../../components/ui/Modal/Modal.jsx'
import Skeleton from '../../../../components/ui/Skeleton/Skeleton.jsx'
import { useEnLigne } from '../../../../hooks/useEnLigne.js'
import { formatDateHeure } from '../../../../lib/format.js'
import { chargerEcrans, cles, creerEcran, retirerEcran } from '../../api.js'
import { useServicesFile } from '../../hooks/useFile.js'
import LienEcran from '../LienEcran/LienEcran.jsx'
import './ModaleEcrans.css'

const ID = 'nouvel-ecran'

function etatEcran(e) {
  if (e.revoked_at) return `Retiré le ${formatDateHeure(e.revoked_at)}`
  if (e.last_seen_at) return `Allumé, vu le ${formatDateHeure(e.last_seen_at)}`
  return 'Jamais ouvert'
}

// Écrans d'appel de la structure (owner et admin) : créer un lien, le retirer. Un écran
// peut ne suivre que certaines files (par exemple la télévision de la vaccination).
export default function ModaleEcrans({ orgId, onFermer }) {
  const queryClient = useQueryClient()
  const enLigne = useEnLigne()
  const ecrans = useQuery({ queryKey: cles.ecrans(orgId), queryFn: () => chargerEcrans(orgId) })
  const services = useServicesFile(orgId)
  const [libelle, setLibelle] = useState('Télé de la salle d’attente')
  const [files, setFiles] = useState([])
  const [cree, setCree] = useState(null) // { lien, libelle }
  const [occupe, setOccupe] = useState(null)
  const [aConfirmer, setAConfirmer] = useState(null)
  const [erreur, setErreur] = useState(null)
  const nomsFiles = new Map((services.data ?? []).map((s) => [s.id, `${s.letter} · ${s.label}`]))

  async function agir(cle, action) {
    setOccupe(cle)
    setErreur(null)
    try {
      await action()
      await queryClient.invalidateQueries({ queryKey: cles.ecrans(orgId) })
    } catch (e) {
      setErreur(e.message)
    } finally {
      setOccupe(null)
    }
  }

  async function creer(evenement) {
    evenement.preventDefault()
    if (libelle.trim().length < 2) {
      setErreur('Donnez un nom à cet écran (2 à 60 caractères).')
      return
    }
    await agir('creation', async () => {
      const { token } = await creerEcran(orgId, libelle, files)
      // Adresse de l'application en cours : le lien s'ouvre là où Fajkat est installé.
      setCree({ lien: `${window.location.origin}/ecran/${token}`, libelle: libelle.trim() })
    })
  }

  const liste = ecrans.data ?? []

  return (
    <Modal
      ouvert
      onFermer={onFermer}
      taille="large"
      titre="Écrans d’appel"
      description="La télévision de la salle d’attente affiche le numéro appelé, les initiales et la salle. Jamais le nom, le motif ni le service."
      actions={
        <Button variante="secondaire" onClick={onFermer}>
          Fermer
        </Button>
      }
    >
      <div className="modale-ecrans">
        {cree && <LienEcran lien={cree.lien} libelle={cree.libelle} />}
        {erreur && (
          <Message ton="erreur">
            <p>{erreur}</p>
          </Message>
        )}
        {ecrans.error && (
          <Message
            ton="erreur"
            action={<Button onClick={() => ecrans.refetch()}>Réessayer</Button>}
          >
            <p>{ecrans.error.message}</p>
          </Message>
        )}
        {ecrans.isPending && <Skeleton forme="bloc" hauteur="6rem" />}

        {liste.length > 0 && (
          <ul className="modale-ecrans__liste">
            {liste.map((e) => (
              <li key={e.id} className="modale-ecrans__ligne">
                <span className="modale-ecrans__texte">
                  <span className="modale-ecrans__nom">{e.label}</span>
                  <span className="modale-ecrans__doux">
                    {e.queue_service_ids?.length
                      ? e.queue_service_ids.map((id) => nomsFiles.get(id) ?? '?').join(', ')
                      : 'Toutes les files'}{' '}
                    · {etatEcran(e)}
                  </span>
                </span>
                {!e.revoked_at && (
                  <Button
                    variante={aConfirmer === e.id ? 'primaire' : 'discret'}
                    chargement={occupe === e.id}
                    disabled={!enLigne || (occupe !== null && occupe !== e.id)}
                    onClick={() => {
                      if (aConfirmer !== e.id) return setAConfirmer(e.id)
                      setAConfirmer(null)
                      return agir(e.id, () => retirerEcran(e.id))
                    }}
                  >
                    {aConfirmer === e.id ? 'Confirmer : le lien ne servira plus' : 'Retirer'}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}

        <form id={ID} className="modale-ecrans__creation" onSubmit={creer}>
          <h3 className="modale-ecrans__titre">Nouvel écran</h3>
          <Field label="Nom de l’écran">
            <Input value={libelle} maxLength={60} onChange={(e) => setLibelle(e.target.value)} />
          </Field>
          <Field label="Files affichées" groupe aide="Aucune case cochée : toutes les files.">
            <div className="modale-ecrans__files">
              {(services.data ?? []).map((s) => (
                <Checkbox
                  key={s.id}
                  label={`${s.letter} · ${s.label}`}
                  checked={files.includes(s.id)}
                  onChange={(e) =>
                    setFiles((f) => (e.target.checked ? [...f, s.id] : f.filter((x) => x !== s.id)))
                  }
                />
              ))}
            </div>
          </Field>
          <Button type="submit" chargement={occupe === 'creation'} disabled={!enLigne}>
            Créer le lien de l’écran
          </Button>
        </form>
      </div>
    </Modal>
  )
}
