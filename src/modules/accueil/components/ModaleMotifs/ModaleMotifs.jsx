import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import Button from '../../../../components/ui/Button/Button.jsx'
import Field from '../../../../components/ui/Field/Field.jsx'
import Input from '../../../../components/ui/Input/Input.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import Modal from '../../../../components/ui/Modal/Modal.jsx'
import Skeleton from '../../../../components/ui/Skeleton/Skeleton.jsx'
import { useEnLigne } from '../../../../hooks/useEnLigne.js'
import { ajouterMotifGratuite, cles, modifierMotifGratuite } from '../../api.js'
import { useMotifsGratuite } from '../../hooks/useFile.js'
import './ModaleMotifs.css'

const ID = 'motifs-gratuite'

// Liste des motifs de gratuité de la structure (owner et admin) : ajouter, renommer,
// retirer ou remettre. Jamais de suppression : un motif retiré reste dans les tickets déjà
// délivrés et dans les bilans.
export default function ModaleMotifs({ orgId, onFermer }) {
  const queryClient = useQueryClient()
  const enLigne = useEnLigne()
  const motifs = useMotifsGratuite(orgId)
  const [nouveau, setNouveau] = useState('')
  const [edition, setEdition] = useState(null) // { id, libelle }
  const [occupe, setOccupe] = useState(null)
  const [erreur, setErreur] = useState(null)
  const liste = motifs.data ?? []

  async function agir(cle, action) {
    setOccupe(cle)
    setErreur(null)
    try {
      await action()
      await queryClient.invalidateQueries({ queryKey: cles.motifsGratuite(orgId) })
      return true
    } catch (e) {
      setErreur(e.message)
      return false
    } finally {
      setOccupe(null)
    }
  }

  async function ajouter(evenement) {
    evenement.preventDefault()
    if (nouveau.trim().length < 2) {
      setErreur('Le motif doit compter de 2 à 60 caractères.')
      return
    }
    const ordre = Math.max(0, ...liste.map((m) => m.sort_order ?? 0)) + 10
    if (await agir('ajout', () => ajouterMotifGratuite(orgId, nouveau, ordre))) setNouveau('')
  }

  async function renommer(evenement) {
    evenement.preventDefault()
    const { id, libelle } = edition
    const ok = await agir(id, () => modifierMotifGratuite(id, { label: libelle.trim() }))
    if (ok) setEdition(null)
  }

  return (
    <Modal
      ouvert
      onFermer={onFermer}
      titre="Motifs de gratuité"
      description="Choisis à la délivrance d’un ticket à 0 FCFA, et comptés à part dans les bilans."
      actions={
        <Button variante="secondaire" onClick={onFermer}>
          Fermer
        </Button>
      }
    >
      <div className="modale-motifs">
        {motifs.error && (
          <Message
            ton="erreur"
            action={<Button onClick={() => motifs.refetch()}>Réessayer</Button>}
          >
            <p>{motifs.error.message}</p>
          </Message>
        )}
        {motifs.isPending && <Skeleton forme="bloc" hauteur="10rem" />}
        {erreur && (
          <Message ton="erreur">
            <p>{erreur}</p>
          </Message>
        )}

        {liste.length > 0 && (
          <ul className="modale-motifs__liste">
            {liste.map((m) => (
              <li key={m.id} className="modale-motifs__ligne">
                {edition?.id === m.id ? (
                  <form className="modale-motifs__edition" onSubmit={renommer}>
                    <Field label={`Nouveau libellé pour « ${m.label} »`}>
                      <Input
                        value={edition.libelle}
                        maxLength={60}
                        autoFocus
                        onChange={(e) => setEdition({ id: m.id, libelle: e.target.value })}
                      />
                    </Field>
                    <div className="modale-motifs__boutons">
                      <Button variante="discret" onClick={() => setEdition(null)}>
                        Annuler
                      </Button>
                      <Button type="submit" chargement={occupe === m.id} disabled={!enLigne}>
                        Enregistrer
                      </Button>
                    </div>
                  </form>
                ) : (
                  <>
                    <span
                      className={`modale-motifs__libelle${m.is_active ? '' : ' modale-motifs__libelle--retire'}`}
                    >
                      {m.label}
                      {!m.is_active && <span className="modale-motifs__etat"> (retiré)</span>}
                    </span>
                    <span className="modale-motifs__boutons">
                      <Button
                        variante="discret"
                        disabled={!enLigne || occupe !== null}
                        onClick={() => setEdition({ id: m.id, libelle: m.label })}
                      >
                        Renommer
                      </Button>
                      <Button
                        variante="discret"
                        chargement={occupe === m.id}
                        disabled={!enLigne || (occupe !== null && occupe !== m.id)}
                        onClick={() =>
                          agir(m.id, () => modifierMotifGratuite(m.id, { is_active: !m.is_active }))
                        }
                      >
                        {m.is_active ? 'Retirer' : 'Remettre'}
                      </Button>
                    </span>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}

        <form id={ID} className="modale-motifs__ajout" onSubmit={ajouter}>
          <Field
            label="Ajouter un motif"
            aide="Par exemple : Plan Sésame, indigent, agent de santé."
          >
            <Input value={nouveau} maxLength={60} onChange={(e) => setNouveau(e.target.value)} />
          </Field>
          <Button type="submit" chargement={occupe === 'ajout'} disabled={!enLigne}>
            Ajouter
          </Button>
        </form>
      </div>
    </Modal>
  )
}
