import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import Button from '../../../../components/ui/Button/Button.jsx'
import Field from '../../../../components/ui/Field/Field.jsx'
import Input from '../../../../components/ui/Input/Input.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import Modal from '../../../../components/ui/Modal/Modal.jsx'
import Textarea from '../../../../components/ui/Textarea/Textarea.jsx'
import { useToast } from '../../../../hooks/useToast.js'
import { formatDateHeure, formatHeure } from '../../../../lib/format.js'
import { chargerCorrections, chargerMembres, cles, corrigerPresence } from '../../api.js'
import { decalerJours, heureDe, libelleJour, nomMembre, versInstant } from '../../utils.js'
import './ModaleCorrection.css'

// Correction d'un pointage, ou saisie d'une présence oubliée, par owner ou admin.
// Le motif est obligatoire ; l'ancienne valeur et le motif sont gardés (attendance_corrections).
export default function ModaleCorrection({ orgId, jour, ligne, onFermer, onCorrige }) {
  const toast = useToast()
  const { presence, membre } = ligne
  const jourBase = presence?.work_date ?? jour
  const [arrivee, setArrivee] = useState(heureDe(presence?.check_in_at))
  const [depart, setDepart] = useState(heureDe(presence?.check_out_at))
  const [motif, setMotif] = useState('')
  const [erreurs, setErreurs] = useState({})
  const [envoi, setEnvoi] = useState(false)
  const [echec, setEchec] = useState(null)
  // Heure d'ouverture de la fenêtre : repère pour signaler un départ dans le futur.
  const [ouverteLe] = useState(() => Date.now())

  // Départ plus tôt que l'arrivée (ou à la même heure) : le lendemain (garde de nuit).
  const lendemain = Boolean(depart && arrivee && depart <= arrivee)
  const jourDepart = lendemain ? decalerJours(jourBase, 1) : jourBase
  const departFutur =
    depart && arrivee && new Date(versInstant(jourDepart, depart)).getTime() > ouverteLe
  const alerteDepart = departFutur
    ? lendemain
      ? `Le départ (${depart}) est plus tôt que l’arrivée (${arrivee}) : il serait compté le lendemain, donc dans le futur. Vérifiez les heures.`
      : `Le départ (${depart}) est dans le futur. Vérifiez les heures.`
    : null

  async function enregistrer() {
    const trouvees = {}
    if (!arrivee) trouvees.arrivee = 'Indiquez l’heure d’arrivée.'
    if (alerteDepart) trouvees.depart = alerteDepart
    if (motif.trim().length < 5)
      trouvees.motif = 'Expliquez la correction en quelques mots (5 caractères au moins).'
    setErreurs(trouvees)
    const premiere = ['arrivee', 'depart', 'motif'].find((c) => trouvees[c])
    if (premiere) return document.getElementById(`correction-${premiere}`)?.focus()

    setEnvoi(true)
    setEchec(null)
    try {
      await corrigerPresence(orgId, {
        presenceId: presence?.id,
        membreId: presence ? null : membre.id,
        jour: presence ? null : jourBase,
        arrivee: versInstant(jourBase, arrivee),
        depart: depart ? versInstant(jourDepart, depart) : null,
        motif,
      })
      toast.succes(`Présence de ${nomMembre(membre)} corrigée`)
      onCorrige()
    } catch (e) {
      setEchec(e.message)
      setEnvoi(false)
    }
  }

  return (
    <Modal
      ouvert
      onFermer={onFermer}
      titre={`${presence ? 'Corriger' : 'Saisir'} la présence — ${nomMembre(membre)}`}
      description={`Jour de travail : ${libelleJour(jourBase)}.`}
      actions={
        <>
          <Button variante="secondaire" onClick={onFermer}>
            Annuler
          </Button>
          <Button chargement={envoi} onClick={enregistrer}>
            Enregistrer la correction
          </Button>
        </>
      }
    >
      <div className="modale-correction">
        <div className="modale-correction__heures">
          <Field id="correction-arrivee" label="Arrivée" requis erreur={erreurs.arrivee}>
            <Input type="time" mono value={arrivee} onChange={(e) => setArrivee(e.target.value)} />
          </Field>
          <Field
            id="correction-depart"
            label="Départ"
            facultatif
            aide="Plus tôt que l’arrivée : compté le lendemain."
            erreur={alerteDepart}
          >
            <Input type="time" mono value={depart} onChange={(e) => setDepart(e.target.value)} />
          </Field>
        </div>
        <Field
          id="correction-motif"
          label="Motif de la correction"
          requis
          aide="Gardé dans l’historique et visible par la personne concernée."
          erreur={erreurs.motif}
        >
          <Textarea
            rows={3}
            maxLength={500}
            value={motif}
            onChange={(e) => setMotif(e.target.value)}
          />
        </Field>
        {echec && (
          <Message ton="erreur" titre="Correction non enregistrée">
            <p>{echec}</p>
            <p>Votre saisie est conservée : réessayez.</p>
          </Message>
        )}
        {presence && <Historique orgId={orgId} presenceId={presence.id} />}
      </div>
    </Modal>
  )
}

function Historique({ orgId, presenceId }) {
  const corrections = useQuery({
    queryKey: cles.corrections(presenceId),
    queryFn: () => chargerCorrections(presenceId),
  })
  const membres = useQuery({ queryKey: cles.membres(orgId), queryFn: () => chargerMembres(orgId) })
  if (!corrections.data?.length) return null
  const auteur = (userId) => {
    const membre = (membres.data ?? []).find((m) => m.user_id === userId)
    return membre ? nomMembre(membre) : 'Responsable'
  }

  return (
    <section className="modale-correction__historique" aria-labelledby="correction-historique">
      <h3 id="correction-historique" className="modale-correction__titre">
        Corrections précédentes
      </h3>
      <ul className="modale-correction__liste">
        {corrections.data.map((c) => (
          <li key={c.id}>
            <span className="modale-correction__quand">
              {formatDateHeure(c.created_at)} · {auteur(c.created_by)}
            </span>
            <span className="modale-correction__valeurs">
              {c.old_check_in_at
                ? `${formatHeure(c.old_check_in_at)} → ${formatHeure(c.old_check_out_at) || '…'}`
                : 'Aucun pointage'}{' '}
              devient {formatHeure(c.new_check_in_at)} → {formatHeure(c.new_check_out_at) || '…'}
            </span>
            <span>« {c.reason} »</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
