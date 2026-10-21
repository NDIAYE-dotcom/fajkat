import { useQueryClient } from '@tanstack/react-query'
import { CalendarPlus, Pencil, Undo2 } from 'lucide-react'
import { useState } from 'react'
import Button from '../../../../components/ui/Button/Button.jsx'
import Field from '../../../../components/ui/Field/Field.jsx'
import Icone from '../../../../components/ui/Icone/Icone.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import Modal from '../../../../components/ui/Modal/Modal.jsx'
import Skeleton from '../../../../components/ui/Skeleton/Skeleton.jsx'
import Textarea from '../../../../components/ui/Textarea/Textarea.jsx'
import { useEnLigne } from '../../../../hooks/useEnLigne.js'
import { useToast } from '../../../../hooks/useToast.js'
import { formatDate } from '../../../../lib/format.js'
import { cles, retenirDatation, retirerGrossesse } from '../../api.js'
import { formatGPE, formatSA, LIBELLES_DATATION } from '../../grossesse.js'
import { useGrossesse } from '../../hooks/useMaternite.js'
import HistoriqueDatations from '../HistoriqueDatations/HistoriqueDatations.jsx'
import ModaleDatation from '../ModaleDatation/ModaleDatation.jsx'
import ModaleObstetrique from '../ModaleObstetrique/ModaleObstetrique.jsx'
import TableauCpn from '../TableauCpn/TableauCpn.jsx'
import './SuiviGrossesse.css'

// Grossesse en cours : terme du jour (calculé par la base), DPA, datation retenue, gestité,
// parité, groupe sanguin ; datations, corrections et retrait pour les soignants qui écrivent.
export default function SuiviGrossesse({ id, patientId, ecrire, reglages }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const enLigne = useEnLigne()
  const requete = useGrossesse(id)
  const [fenetre, setFenetre] = useState(null) // 'datation' | 'obstetrique' | 'retrait'
  const [occupe, setOccupe] = useState(null)
  const [echec, setEchec] = useState(null)

  const relire = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: cles.grossesse(id) }),
      queryClient.invalidateQueries({ queryKey: cles.grossessesPatiente(patientId) }),
      // Une nouvelle datation change le terme des CPN à venir et le bilan.
      queryClient.invalidateQueries({ queryKey: cles.bilanCpn(id) }),
    ])

  if (requete.isPending) return <Skeleton forme="bloc" hauteur="10rem" />
  if (requete.error) {
    return (
      <Message ton="erreur" action={<Button onClick={() => requete.refetch()}>Réessayer</Button>}>
        <p>{requete.error.message}</p>
      </Message>
    )
  }
  const g = requete.data
  const retenue = g.datings.find((d) => d.is_current)

  async function retenir(d) {
    setOccupe(d.id)
    setEchec(null)
    try {
      await retenirDatation(g.id, d.id)
      await relire()
      toast.succes('Datation retenue')
    } catch (e) {
      setEchec(e.message)
    } finally {
      setOccupe(null)
    }
  }

  async function apres(message) {
    setFenetre(null)
    await relire()
    toast.succes(message)
  }

  return (
    <section className="suivi-grossesse" aria-labelledby="suivi-grossesse-titre">
      <div className="suivi-grossesse__fiche">
        <h2 id="suivi-grossesse-titre" className="suivi-grossesse__titre">
          Grossesse en cours
        </h2>
        <dl className="suivi-grossesse__valeurs">
          <div>
            <dt>Terme aujourd’hui</dt>
            <dd className="suivi-grossesse__terme">{formatSA(g.ga_days)}</dd>
          </div>
          <div>
            <dt>Date prévue d’accouchement</dt>
            <dd className="suivi-grossesse__chiffres">{formatDate(g.edd)}</dd>
          </div>
          <div>
            <dt>Datation retenue</dt>
            <dd>{retenue ? LIBELLES_DATATION[retenue.kind] : '—'}</dd>
          </div>
          <div>
            <dt>Gestité, parité</dt>
            <dd className="suivi-grossesse__chiffres">{formatGPE(g)}</dd>
          </div>
          <div>
            <dt>Groupe sanguin</dt>
            <dd className="suivi-grossesse__chiffres">{g.blood_group ?? 'Non renseigné'}</dd>
          </div>
          <div>
            <dt>Suivi ouvert le</dt>
            <dd className="suivi-grossesse__chiffres">{formatDate(g.opened_on)}</dd>
          </div>
        </dl>
        {ecrire && (
          <div className="suivi-grossesse__actions">
            <Button
              variante="secondaire"
              iconeDebut={<Icone icone={CalendarPlus} />}
              disabled={!enLigne}
              onClick={() => setFenetre('datation')}
            >
              Nouvelle datation
            </Button>
            <Button
              variante="secondaire"
              iconeDebut={<Icone icone={Pencil} />}
              disabled={!enLigne}
              onClick={() => setFenetre('obstetrique')}
            >
              Gestité, parité, groupe
            </Button>
            <Button
              variante="discret"
              iconeDebut={<Icone icone={Undo2} />}
              disabled={!enLigne}
              onClick={() => setFenetre('retrait')}
            >
              Retirer ce suivi
            </Button>
          </div>
        )}
      </div>

      <TableauCpn grossesseId={g.id} ecrire={ecrire} />

      <section className="suivi-grossesse__section" aria-labelledby="suivi-datations">
        <h3 id="suivi-datations" className="suivi-grossesse__sous-titre">
          Datations
        </h3>
        {echec && (
          <Message ton="erreur" titre="Datation non retenue">
            <p>{echec}</p>
          </Message>
        )}
        <HistoriqueDatations
          datations={g.datings}
          retenir={ecrire ? retenir : null}
          occupe={occupe}
          enLigne={enLigne}
        />
      </section>

      {fenetre === 'datation' && (
        <ModaleDatation
          grossesse={g}
          reglages={reglages}
          onFermer={() => setFenetre(null)}
          onEnregistree={() => apres('Datation enregistrée et retenue')}
        />
      )}
      {fenetre === 'obstetrique' && (
        <ModaleObstetrique
          grossesse={g}
          onFermer={() => setFenetre(null)}
          onEnregistre={() => apres('Modifications enregistrées')}
        />
      )}
      {fenetre === 'retrait' && (
        <ModaleRetrait
          grossesse={g}
          onFermer={() => setFenetre(null)}
          onRetiree={() => apres('Suivi de grossesse retiré')}
        />
      )}
    </section>
  )
}

// Suivi ouvert par erreur : retiré avec un motif, jamais effacé (le journal le garde).
function ModaleRetrait({ grossesse, onFermer, onRetiree }) {
  const enLigne = useEnLigne()
  const [motif, setMotif] = useState('')
  const [erreur, setErreur] = useState(null)
  const [envoi, setEnvoi] = useState(false)
  const [echec, setEchec] = useState(null)

  async function retirer() {
    if (motif.trim().length < 3) {
      setErreur('Indiquez pourquoi ce suivi est retiré.')
      document.getElementById('retrait-grossesse-motif')?.focus()
      return
    }
    setEnvoi(true)
    setEchec(null)
    try {
      await retirerGrossesse(grossesse.id, motif.trim())
      onRetiree()
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
      titre="Retirer ce suivi de grossesse ?"
      actions={
        <>
          <Button variante="secondaire" onClick={onFermer} disabled={envoi}>
            Garder
          </Button>
          <Button chargement={envoi} disabled={!enLigne} onClick={retirer}>
            Retirer
          </Button>
        </>
      }
    >
      <div className="suivi-grossesse__retrait">
        <p>
          À faire seulement pour un suivi ouvert par erreur (mauvais dossier, grossesse non
          confirmée). Il n’est jamais effacé : le journal du dossier le garde.
        </p>
        <Field id="retrait-grossesse-motif" label="Motif" requis erreur={erreur}>
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
        {echec && (
          <Message ton="erreur" titre="Suivi non retiré">
            <p>{echec}</p>
          </Message>
        )}
      </div>
    </Modal>
  )
}
