import { useState } from 'react'
import Button from '../../../../components/ui/Button/Button.jsx'
import Field from '../../../../components/ui/Field/Field.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import Modal from '../../../../components/ui/Modal/Modal.jsx'
import Select from '../../../../components/ui/Select/Select.jsx'
import { useToast } from '../../../../hooks/useToast.js'
import { affecter, retirerAffectation } from '../../api.js'
import { absentsDuJour, horairesCreneau, libelleJour, libelleRole, nomMembre } from '../../utils.js'
import './ModaleCreneau.css'

// Un créneau, un jour : qui est affecté, ajout par sélection (pas de glisser-déposer,
// impraticable sur un petit téléphone), retrait.
export default function ModaleCreneau({
  orgId,
  jour,
  creneau,
  creneaux,
  cases,
  membres,
  calendrier,
  onFermer,
  onChange,
}) {
  const toast = useToast()
  const [membreId, setMembreId] = useState('')
  const [envoi, setEnvoi] = useState(null)
  const [erreur, setErreur] = useState(null)
  const affectes = cases.get(`${jour}|${creneau.id}`) ?? []
  const dejaLa = new Set(affectes.map((a) => a.membreId))
  const disponibles = (membres ?? []).filter((m) => m.is_active && !dejaLa.has(m.id))

  const absents = absentsDuJour(calendrier, jour)

  // Autres créneaux du même jour pour la personne choisie : signalé, pas interdit.
  const autres = membreId
    ? creneaux.filter(
        (c) =>
          c.id !== creneau.id &&
          (cases.get(`${jour}|${c.id}`) ?? []).some((a) => a.membreId === membreId),
      )
    : []

  async function executer(quoi, action, succes) {
    setEnvoi(quoi)
    setErreur(null)
    try {
      await action()
      toast.succes(succes)
      onChange()
      return true
    } catch (e) {
      setErreur(e.message)
      return false
    } finally {
      setEnvoi(null)
    }
  }

  async function surAffecter() {
    if (!membreId) {
      setErreur('Choisissez un membre.')
      return document.getElementById('modale-creneau-membre')?.focus()
    }
    const membre = membres.find((m) => m.id === membreId)
    const ok = await executer(
      'affecter',
      () => affecter(orgId, { creneauId: creneau.id, membreId, date: jour }),
      `${nomMembre(membre)} : ${creneau.label}, ${libelleJour(jour)}`,
    )
    if (ok) setMembreId('')
  }

  return (
    <Modal
      ouvert
      onFermer={onFermer}
      titre={`${creneau.label} — ${libelleJour(jour)}`}
      description={horairesCreneau(creneau)}
      actions={
        <Button variante="secondaire" onClick={onFermer}>
          Fermer
        </Button>
      }
    >
      <div className="modale-creneau">
        <section aria-labelledby="modale-creneau-affectes">
          <h3 id="modale-creneau-affectes" className="modale-creneau__titre">
            Affecté(s)
          </h3>
          {affectes.length === 0 ? (
            <p className="modale-creneau__vide">Personne pour l’instant.</p>
          ) : (
            <ul className="modale-creneau__liste">
              {affectes.map(({ id, membre }) => (
                <li key={id} className="modale-creneau__ligne">
                  <span>
                    {nomMembre(membre)}
                    {membre && (
                      <span className="modale-creneau__role"> · {libelleRole(membre.role)}</span>
                    )}
                    {membre && absents.has(membre.id) && (
                      <span className="modale-creneau__conflit"> · en congé ce jour-là</span>
                    )}
                  </span>
                  <Button
                    variante="discret"
                    chargement={envoi === id}
                    aria-label={`Retirer ${nomMembre(membre)} de ce créneau`}
                    onClick={() =>
                      executer(
                        id,
                        () => retirerAffectation(id),
                        `${nomMembre(membre)} retiré(e) du créneau`,
                      )
                    }
                  >
                    Retirer
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="modale-creneau__ajout">
          <Field id="modale-creneau-membre" label="Ajouter un membre">
            <Select
              value={membreId}
              placeholder={
                disponibles.length ? 'Choisir un membre' : 'Tous les membres sont affectés'
              }
              disabled={!disponibles.length}
              options={disponibles.map((m) => ({
                valeur: m.id,
                libelle: `${nomMembre(m)} · ${libelleRole(m.role)}`,
              }))}
              onChange={(e) => {
                setMembreId(e.target.value)
                setErreur(null)
              }}
            />
          </Field>
          {membreId && absents.has(membreId) && (
            <Message ton="erreur" titre="En congé ce jour-là">
              <p>Son congé est validé pour cette date. Choisissez plutôt une autre personne.</p>
            </Message>
          )}
          {autres.length > 0 && (
            <Message titre="Déjà prévu ce jour-là">
              <p>
                Cette personne est aussi au créneau {autres.map((c) => c.label).join(', ')}.
                Vérifiez qu’elle aura le temps de se reposer.
              </p>
            </Message>
          )}
          {erreur && (
            <Message ton="erreur">
              <p>{erreur}</p>
            </Message>
          )}
          <div>
            <Button
              chargement={envoi === 'affecter'}
              disabled={!disponibles.length}
              onClick={surAffecter}
            >
              Affecter
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
