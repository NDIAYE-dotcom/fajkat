import { useQueryClient } from '@tanstack/react-query'
import { ClipboardPlus } from 'lucide-react'
import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
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
import { etatRetour } from '../../../consultations/utils.js'
import { cles, retirerCpnAilleurs } from '../../api.js'
import {
  formatHauteur,
  formatPoids,
  formatTension,
  libelleBcf,
  resumeBilan,
  texteProchaine,
} from '../../cpn.js'
import { formatSA } from '../../grossesse.js'
import { useBilanCpn, useCpn } from '../../hooks/useMaternite.js'
import ModaleCpnAilleurs from '../ModaleCpnAilleurs/ModaleCpnAilleurs.jsx'
import './TableauCpn.css'

// CPN de la grossesse, en fiches de registre, dans l'ordre des dates (numéro calculé par la base),
// faites ici ou ailleurs (d'après le carnet), et bilan : attendues, faites, manquées,
// prochaine. Aide-soignant : mêmes colonnes pour toutes les CPN, sans remarque ni lien.
export default function TableauCpn({ grossesseId, ecrire }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const enLigne = useEnLigne()
  const location = useLocation()
  const cpn = useCpn(grossesseId)
  const bilan = useBilanCpn(grossesseId)
  const [fenetre, setFenetre] = useState(null) // 'ailleurs' | { retrait: ligne }

  const relire = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: cles.cpn(grossesseId) }),
      queryClient.invalidateQueries({ queryKey: cles.bilanCpn(grossesseId) }),
    ])

  async function apres(message) {
    setFenetre(null)
    await relire()
    toast.succes(message)
  }

  const b = bilan.data
  const prochaine = texteProchaine(b?.next)
  return (
    <section className="tableau-cpn" aria-labelledby="tableau-cpn-titre">
      <div className="tableau-cpn__entete">
        <h3 id="tableau-cpn-titre" className="tableau-cpn__titre">
          Consultations prénatales
        </h3>
        {ecrire && (
          <Button
            variante="secondaire"
            iconeDebut={<Icone icone={ClipboardPlus} />}
            disabled={!enLigne}
            onClick={() => setFenetre('ailleurs')}
          >
            Noter une CPN faite ailleurs
          </Button>
        )}
      </div>
      {b && (
        <div className="tableau-cpn__bilan" role="status">
          <p>
            <strong>{b.model_label}</strong> : {resumeBilan(b)}
            {b.expected !== null && b.expected !== undefined && (
              <> (attendues à ce jour : {b.expected})</>
            )}
            .
          </p>
          {prochaine && <p>Prochaine : {prochaine}</p>}
        </div>
      )}
      {[cpn, bilan].map(
        (r, i) =>
          r.error && (
            <Message
              key={i}
              ton="erreur"
              action={<Button onClick={() => r.refetch()}>Réessayer</Button>}
            >
              <p>{r.error.message}</p>
            </Message>
          ),
      )}
      {cpn.isPending && <Skeleton forme="bloc" hauteur="6rem" />}
      {cpn.data?.length === 0 && (
        <p className="tableau-cpn__vide">Aucune CPN notée pour cette grossesse.</p>
      )}
      {cpn.data?.length > 0 && (
        <ol className="tableau-cpn__liste" aria-label="CPN de la grossesse en cours">
          {cpn.data.map((c) => (
            <FicheCpn
              key={c.id}
              cpn={c}
              lien={c.encounter_id ? `/app/consultations/${c.encounter_id}` : null}
              etat={etatRetour(location)}
              onRetirer={
                ecrire && c.origin === 'elsewhere' && enLigne
                  ? () => setFenetre({ retrait: c })
                  : null
              }
            />
          ))}
        </ol>
      )}

      {fenetre === 'ailleurs' && (
        <ModaleCpnAilleurs
          grossesseId={grossesseId}
          onFermer={() => setFenetre(null)}
          onNotee={() => apres('CPN notée')}
        />
      )}
      {fenetre?.retrait && (
        <ModaleRetraitCpn
          cpn={fenetre.retrait}
          onFermer={() => setFenetre(null)}
          onRetiree={() => apres('CPN retirée')}
        />
      )}
    </section>
  )
}

// Une CPN, façon fiche de registre : en-tête (numéro, date, lieu, terme), puis les mesures.
// Mêmes cases pour toutes les CPN ; la remarque n'existe que pour les soignants habilités.
function FicheCpn({ cpn: c, lien, etat, onRetirer }) {
  const mesures = [
    ['Poids', formatPoids(c.weight_kg), true],
    ['Tension', formatTension(c.systolic, c.diastolic), true],
    ['Hauteur utérine', formatHauteur(c.fundal_height_cm), true],
    ['BCF', libelleBcf(c.fetal_heart_heard, c.fetal_heart_rate)],
    ['Présentation', c.presentation ?? '—'],
    ['Œdèmes', c.oedema ?? '—'],
    ['Protéinurie', c.proteinuria ?? '—'],
    ['Glycosurie', c.glycosuria ?? '—'],
  ]
  return (
    <li className="tableau-cpn__fiche">
      <div className="tableau-cpn__tete">
        <span className="tableau-cpn__numero">CPN {c.anc_number}</span>
        <span className="tableau-cpn__chiffres">{formatDate(c.visit_date)}</span>
        <span className="tableau-cpn__chiffres">{formatSA(c.ga_days) || '—'}</span>
        <span className="tableau-cpn__lieu">{c.origin === 'here' ? 'Ici' : c.place}</span>
      </div>
      <dl className="tableau-cpn__mesures">
        {mesures.map(([titre, valeur, chiffres]) => (
          <div key={titre}>
            <dt>{titre}</dt>
            <dd className={chiffres ? 'tableau-cpn__chiffres' : undefined}>{valeur}</dd>
          </div>
        ))}
      </dl>
      {c.note && <p className="tableau-cpn__note">{c.note}</p>}
      {(lien || onRetirer) && (
        <div className="tableau-cpn__actions">
          {lien && (
            <Link to={lien} state={etat} className="tableau-cpn__lien">
              Voir la consultation
            </Link>
          )}
          {onRetirer && (
            <Button variante="discret" onClick={onRetirer}>
              Retirer
            </Button>
          )}
        </div>
      )}
    </li>
  )
}

// CPN faite ailleurs notée par erreur : retirée avec un motif, jamais effacée.
function ModaleRetraitCpn({ cpn, onFermer, onRetiree }) {
  const enLigne = useEnLigne()
  const [motif, setMotif] = useState('')
  const [erreur, setErreur] = useState(null)
  const [envoi, setEnvoi] = useState(false)
  const [echec, setEchec] = useState(null)

  async function retirer() {
    if (motif.trim().length < 3) {
      setErreur('Indiquez pourquoi cette CPN est retirée.')
      document.getElementById('retrait-cpn-motif')?.focus()
      return
    }
    setEnvoi(true)
    setEchec(null)
    try {
      await retirerCpnAilleurs(cpn.id, motif.trim())
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
      titre={`Retirer la CPN ${cpn.anc_number} ?`}
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
      <div className="tableau-cpn__retrait">
        <p>
          CPN du {formatDate(cpn.visit_date)} ({cpn.place}), notée d’après le carnet. Elle n’est
          jamais effacée : le journal du dossier la garde. Les numéros suivants sont recalculés.
        </p>
        <Field id="retrait-cpn-motif" label="Motif" requis erreur={erreur}>
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
          <Message ton="erreur" titre="CPN non retirée">
            <p>{echec}</p>
          </Message>
        )}
      </div>
    </Modal>
  )
}
