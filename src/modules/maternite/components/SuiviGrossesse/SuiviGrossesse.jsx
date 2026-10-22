import { useQueryClient } from '@tanstack/react-query'
import { CalendarPlus, Pencil, Undo2 } from 'lucide-react'
import { useState } from 'react'
import Button from '../../../../components/ui/Button/Button.jsx'
import Icone from '../../../../components/ui/Icone/Icone.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import Skeleton from '../../../../components/ui/Skeleton/Skeleton.jsx'
import { useEnLigne } from '../../../../hooks/useEnLigne.js'
import { useToast } from '../../../../hooks/useToast.js'
import { formatDate } from '../../../../lib/format.js'
import { cles, retenirDatation, retirerGrossesse } from '../../api.js'
import { formatGPE, formatSA, LIBELLES_DATATION } from '../../grossesse.js'
import { useGrossesse } from '../../hooks/useMaternite.js'
import ExamensGrossesse from '../ExamensGrossesse/ExamensGrossesse.jsx'
import HistoriqueDatations from '../HistoriqueDatations/HistoriqueDatations.jsx'
import ModaleDatation from '../ModaleDatation/ModaleDatation.jsx'
import ModaleMotif from '../ModaleMotif/ModaleMotif.jsx'
import ModaleObstetrique from '../ModaleObstetrique/ModaleObstetrique.jsx'
import RepereDatationFusion from '../RepereDatationFusion/RepereDatationFusion.jsx'
import SoinsGrossesse from '../SoinsGrossesse/SoinsGrossesse.jsx'
import TableauCpn from '../TableauCpn/TableauCpn.jsx'
import './SuiviGrossesse.css'

// Grossesse en cours : terme du jour (calculé par la base), DPA, datation retenue, gestité,
// parité, groupe sanguin ; CPN, soins et Td ; datations, corrections et retrait pour les
// soignants qui écrivent. Soignants habilités seulement (ecrire) : examens de la grossesse
// et repère « Datation à vérifier » ; pour les autres ces blocs n'existent pas à l'écran.
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
      // Une nouvelle datation change le terme des CPN à venir, le bilan et les soins.
      queryClient.invalidateQueries({ queryKey: cles.bilanCpn(id) }),
      queryClient.invalidateQueries({ queryKey: cles.soins(id) }),
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

      {g.dating_review_since && (
        <RepereDatationFusion
          grossesse={g}
          onVerifiee={async () => {
            await relire()
            toast.succes('Datation vérifiée')
          }}
        />
      )}

      <TableauCpn grossesseId={g.id} ecrire={ecrire} />

      <SoinsGrossesse grossesseId={g.id} patientId={patientId} ecrire={ecrire} />

      {ecrire && <ExamensGrossesse grossesseId={g.id} />}

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
        // Suivi ouvert par erreur : retiré avec un motif, jamais effacé.
        <ModaleMotif
          titre="Retirer ce suivi de grossesse ?"
          texte="À faire seulement pour un suivi ouvert par erreur (mauvais dossier, grossesse non confirmée). Il n’est jamais effacé : le journal du dossier le garde."
          action="Retirer"
          aideMotif="Indiquez pourquoi ce suivi est retiré."
          onFermer={() => setFenetre(null)}
          onConfirmer={async (motif) => {
            await retirerGrossesse(g.id, motif)
            await apres('Suivi de grossesse retiré')
          }}
        />
      )}
    </section>
  )
}
