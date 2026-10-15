import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import Button from '../../../../components/ui/Button/Button.jsx'
import Field from '../../../../components/ui/Field/Field.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import Modal from '../../../../components/ui/Modal/Modal.jsx'
import Skeleton from '../../../../components/ui/Skeleton/Skeleton.jsx'
import Textarea from '../../../../components/ui/Textarea/Textarea.jsx'
import { useBrouillon } from '../../../../hooks/useBrouillon.js'
import { useEnLigne } from '../../../../hooks/useEnLigne.js'
import { useToast } from '../../../../hooks/useToast.js'
import { libelleAge, nomComplet } from '../../../patients/utils.js'
import { annulerConstantes, cles, enregistrerConstantes } from '../../api.js'
import {
  ageEnMois,
  CONSTANTES_VIDES,
  lireSaisie,
  mentionConversion,
  MESURES,
  mesureApplicable,
  regrouperAlertes,
  repartirTension,
} from '../../constantes.js'
import {
  useApercuAlertes,
  useBornes,
  useConstantesPassage,
  useSeuils,
} from '../../hooks/useConstantes.js'
import AlertesConstantes from '../AlertesConstantes/AlertesConstantes.jsx'
import BrouillonRetrouve from '../BrouillonRetrouve/BrouillonRetrouve.jsx'
import ChampMesure from '../ChampMesure/ChampMesure.jsx'
import HistoriqueConstantes from '../HistoriqueConstantes/HistoriqueConstantes.jsx'
import './ModaleConstantes.css'

const ID = 'constantes'
const mesure = (cle) => MESURES.find((m) => m.cle === cle)

// Prise des constantes d'un passage (soignants). Saisie au clavier numérique : Entrée passe
// au champ suivant, puis enregistre. Les valeurs hors seuil s'affichent en tampon pendant
// la saisie, d'après les seuils de la structure. Brouillon automatique (coupures).
export default function ModaleConstantes({ orgId, ligne, onFermer }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const enLigne = useEnLigne()
  const seuils = useSeuils(orgId)
  const bornes = useBornes()
  const mesures = useConstantesPassage(ligne.visit_id)
  const brouillon = useBrouillon(`accueil.constantes.${ligne.visit_id}`, CONSTANTES_VIDES)
  const v = brouillon.valeur
  const [erreurs, setErreurs] = useState({})
  const [echec, setEchec] = useState(null)
  const [vide, setVide] = useState(false)
  const [envoi, setEnvoi] = useState(false)
  // Lecture en direct : erreurs sous les cases, et alertes sur les seules valeurs
  // lisibles et plausibles (jamais sur 1200 mmHg ni sur une tension incomplète).
  const lecture = lireSaisie(v, bornes.data)
  const { note: _note, ...nombres } = lecture.valeurs
  const alertes = regrouperAlertes(
    useApercuAlertes(ligne.patient_id, nombres),
    nombres.systolic,
    nombres.diastolic,
  )
  const conversion = mentionConversion(v)
  // Erreur affichée sous une case : celle de l'envoi, sinon celle de la frappe.
  const erreurDe = (cle) => erreurs[cle] ?? lecture.erreurs[cle]
  const age = ageEnMois(ligne)
  const visibles = MESURES.filter((m) => mesureApplicable(m.cle, seuils.data ?? [], age))
  const alertesDe = (...cles) => alertes.filter((a) => cles.includes(a.measure))

  function maj(champ, valeur) {
    brouillon.setValeur((p) => ({ ...p, [champ]: valeur }))
    setErreurs((e) => ({ ...e, [champ]: undefined }))
    setEchec(null)
    setVide(false)
  }

  // « 180/110 » ou « 18/11 » tapé dans une case de tension : réparti dans les deux cases à
  // la sortie de la case (pas pendant la frappe, sinon « 18/1 » serait coupé trop tôt).
  function repartir() {
    brouillon.setValeur((p) => repartirTension(p))
  }

  // Entrée : champ suivant ; sur le dernier champ, enregistrement.
  function surTouche(evenement) {
    if (evenement.key !== 'Enter' || evenement.target.tagName !== 'INPUT') return
    evenement.preventDefault()
    const champs = [...evenement.currentTarget.querySelectorAll('input[name]')]
    const suivant = champs[champs.indexOf(evenement.target) + 1]
    if (suivant) suivant.focus()
    else evenement.currentTarget.requestSubmit()
  }

  async function enregistrer(evenement) {
    evenement.preventDefault()
    const saisie = repartirTension(v)
    if (saisie !== v) brouillon.setValeur(saisie)
    const lu = lireSaisie(saisie, bornes.data)
    setErreurs(lu.erreurs)
    // Formulaire vide : message général au-dessus du bouton, aucune case n'est obligatoire.
    setVide(lu.vide)
    if (lu.vide) {
      document.querySelector(`#${ID} input[name]`)?.focus()
      return
    }
    const premiere = MESURES.find((m) => lu.erreurs[m.cle])
    if (premiere) {
      document.querySelector(`#${ID} input[name='${premiere.cle}']`)?.focus()
      return
    }
    setEnvoi(true)
    setEchec(null)
    try {
      const enregistree = await enregistrerConstantes(ligne.visit_id, lu.valeurs)
      brouillon.effacer()
      queryClient.invalidateQueries({ queryKey: cles.constantes(ligne.visit_id) })
      queryClient.invalidateQueries({ queryKey: cles.tableau(orgId) })
      const rouge = regrouperAlertes(
        enregistree.alerts,
        enregistree.systolic,
        enregistree.diastolic,
      ).filter((a) => a.level === 'alert')
      toast.succes(`Constantes de ${ligne.ticket_number} enregistrées`, {
        message: rouge.length ? `Alerte : ${rouge.map((a) => a.label).join(', ')}.` : undefined,
      })
      onFermer()
    } catch (e) {
      if (e.champ) setErreurs({ [e.champ]: e.message })
      setEchec(e.message)
    } finally {
      setEnvoi(false)
    }
  }

  async function annuler(id, motif) {
    try {
      await annulerConstantes(id, motif)
      await queryClient.invalidateQueries({ queryKey: cles.constantes(ligne.visit_id) })
      queryClient.invalidateQueries({ queryKey: cles.tableau(orgId) })
      return true
    } catch (e) {
      toast.erreur('Mesure non annulée', { message: e.message })
      return false
    }
  }

  return (
    <Modal
      ouvert
      onFermer={onFermer}
      taille="large"
      fermerSurVoile={false}
      titre={`Constantes : ${ligne.ticket_number}`}
      description={`${nomComplet(ligne)} · ${ligne.sex} · ${libelleAge(ligne)}`}
      actions={
        <Button type="submit" form={ID} chargement={envoi} disabled={!enLigne || seuils.isPending}>
          Enregistrer les constantes
        </Button>
      }
    >
      <div className="constantes">
        {mesures.isPending ? (
          <Skeleton forme="bloc" hauteur="3rem" />
        ) : (
          <HistoriqueConstantes
            mesures={mesures.data ?? []}
            enLigne={enLigne}
            onAnnuler={annuler}
          />
        )}

        <form
          id={ID}
          className="constantes__formulaire"
          noValidate
          onSubmit={enregistrer}
          onKeyDown={surTouche}
        >
          <BrouillonRetrouve brouillon={brouillon} onEffacer={() => setErreurs({})} />

          <div className="constantes__grille">
            {visibles
              .filter((m) => !['systolic', 'diastolic'].includes(m.cle))
              .slice(0, 3)
              .map((m) => (
                <div key={m.cle} className="constantes__champ">
                  <ChampMesure
                    mesure={m}
                    valeur={v[m.cle]}
                    erreur={erreurDe(m.cle)}
                    onChange={maj}
                  />
                  <AlertesConstantes alertes={alertesDe(m.cle)} />
                </div>
              ))}
          </div>

          <fieldset className="constantes__tension">
            <legend className="constantes__legende">Tension artérielle</legend>
            <div className="constantes__paire">
              {['systolic', 'diastolic'].map((cle) => (
                <ChampMesure
                  key={cle}
                  mesure={mesure(cle)}
                  label={mesure(cle).court}
                  valeur={v[cle]}
                  erreur={erreurDe(cle)}
                  onChange={maj}
                  onBlur={repartir}
                />
              ))}
            </div>
            {conversion && (
              <p className="constantes__conversion" role="status">
                {conversion} : vérifiez.
              </p>
            )}
            <AlertesConstantes alertes={alertesDe('tension')} />
          </fieldset>

          <div className="constantes__grille">
            {visibles
              .filter((m) => !['systolic', 'diastolic'].includes(m.cle))
              .slice(3)
              .map((m) => (
                <div key={m.cle} className="constantes__champ">
                  <ChampMesure
                    mesure={m}
                    valeur={v[m.cle]}
                    erreur={erreurDe(m.cle)}
                    onChange={maj}
                  />
                  <AlertesConstantes alertes={alertesDe(m.cle)} />
                </div>
              ))}
          </div>

          <Field label="Note" aide="Facultatif (exemple : mesure prise après repos).">
            <Textarea
              rows={2}
              maxLength={300}
              value={v.note}
              onChange={(e) => maj('note', e.target.value)}
            />
          </Field>

          {!enLigne && (
            <Message ton="info" titre="Vous êtes hors ligne">
              <p>
                La saisie est gardée sur cet appareil. Enregistrez dès le retour de la connexion.
              </p>
            </Message>
          )}
          {vide && (
            <Message ton="erreur">
              <p>Saisissez au moins une mesure avant d’enregistrer.</p>
            </Message>
          )}
          {echec && (
            <Message ton="erreur" titre="Constantes non enregistrées">
              <p>{echec}</p>
              <p>Votre saisie est conservée sur cet appareil.</p>
            </Message>
          )}
        </form>
      </div>
    </Modal>
  )
}
