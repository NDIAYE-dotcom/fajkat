import { useState } from 'react'
import Button from '../../../../components/ui/Button/Button.jsx'
import Checkbox from '../../../../components/ui/Checkbox/Checkbox.jsx'
import Field from '../../../../components/ui/Field/Field.jsx'
import Input from '../../../../components/ui/Input/Input.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import Modal from '../../../../components/ui/Modal/Modal.jsx'
import Select from '../../../../components/ui/Select/Select.jsx'
import Textarea from '../../../../components/ui/Textarea/Textarea.jsx'
import { useBrouillon } from '../../../../hooks/useBrouillon.js'
import { useEnLigne } from '../../../../hooks/useEnLigne.js'
import BrouillonRetrouve from '../../../accueil/components/BrouillonRetrouve/BrouillonRetrouve.jsx'
import { creerReference, enregistrerDestination } from '../../api.js'
import { LIMITES_REFERENCE, resumeReference, traitementsRecus } from '../../documents.js'
import { useDestinations } from '../../hooks/useDocuments.js'
import './ModaleReference.css'

const ID = 'modale-reference'
const AUTRE = 'autre'

// Lettre de référence depuis la consultation (feature « references ») : destination de la
// liste ou écrite, motif, urgence, résumé et traitements reçus pré-remplis depuis la
// consultation, tout modifiable avant l'émission. Brouillon automatique (effacé à la
// déconnexion) ; une lettre émise ne se modifie plus.
//   contenu : contenuConsultation(...) ; onEmise(id, lettre) : la lettre est à imprimer
//   (lettre : destination, urgence, date, pour la liste des documents).
export default function ModaleReference({
  orgId,
  consultation,
  contenu,
  sensible,
  onFermer,
  onEmise,
}) {
  const enLigne = useEnLigne()
  const destinations = useDestinations(orgId)
  const [initial] = useState(() => ({
    destination: '',
    autreNom: '',
    ajouterALaListe: true,
    urgent: false,
    motif: '',
    resume: resumeReference(contenu).slice(0, LIMITES_REFERENCE.resume),
    traitements: traitementsRecus(contenu.medicaments).slice(0, LIMITES_REFERENCE.traitements),
  }))
  const brouillon = useBrouillon(`consultation.${consultation.id}.reference`, initial)
  const v = brouillon.valeur
  const [erreurs, setErreurs] = useState({})
  const [echec, setEchec] = useState(null)
  const [envoi, setEnvoi] = useState(false)
  const actives = (destinations.data ?? []).filter((d) => d.is_active)
  const autre = v.destination === AUTRE || (destinations.isSuccess && actives.length === 0)

  function maj(champ, valeur) {
    brouillon.setValeur((p) => ({ ...p, [champ]: valeur }))
    setErreurs((e) => ({ ...e, [champ]: undefined }))
    setEchec(null)
  }

  function verifier() {
    const e = {}
    if (!autre && !v.destination) e.destination = 'Choisissez l’établissement de destination.'
    if (autre && v.autreNom.trim().length < 2) e.autreNom = 'Écrivez le nom de l’établissement.'
    if (v.motif.trim().length < 2) e.motif = 'Indiquez le motif de la référence.'
    return e
  }

  async function emettre(evenement) {
    evenement.preventDefault()
    const trouvees = verifier()
    setErreurs(trouvees)
    if (Object.keys(trouvees).length) {
      document.querySelector(`#${ID} [aria-invalid='true']`)?.focus()
      return
    }
    setEnvoi(true)
    setEchec(null)
    try {
      let destinationId = autre ? null : v.destination
      if (autre && v.ajouterALaListe) {
        destinationId = (await enregistrerDestination(orgId, { name: v.autreNom })).id
        destinations.refetch()
      }
      const id = await creerReference(consultation.id, {
        destinationId,
        destinationNom: v.autreNom,
        urgent: v.urgent,
        motif: v.motif,
        resume: v.resume,
        traitements: v.traitements,
      })
      brouillon.effacer()
      onEmise(id, {
        destination_name: destinationId
          ? (actives.find((d) => d.id === destinationId)?.name ?? v.autreNom.trim())
          : v.autreNom.trim(),
        urgency: v.urgent ? 'urgent' : 'routine',
        referred_at: new Date().toISOString(),
        counter_referral: null,
      })
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
      taille="large"
      fermerSurVoile={false}
      titre="Référer le patient"
      description="Tout reste modifiable jusqu’à l’émission. Une lettre émise ne se modifie plus."
      actions={
        <Button type="submit" form={ID} chargement={envoi} disabled={!enLigne}>
          Émettre et imprimer la lettre
        </Button>
      }
    >
      <form id={ID} className="modale-reference" noValidate onSubmit={emettre}>
        <BrouillonRetrouve brouillon={brouillon} onEffacer={() => setErreurs({})} />
        {sensible && (
          <Message ton="info" titre="Pli confidentiel">
            <p>
              La lettre portera « Pli confidentiel — à remettre au soignant ». Une fois pliée, seuls
              la destination et le nom du patient restent visibles.
            </p>
          </Message>
        )}

        <div className="modale-reference__ligne">
          {actives.length > 0 && (
            <Field label="Établissement de destination" requis erreur={erreurs.destination}>
              <Select
                value={v.destination}
                placeholder="Choisissez un établissement"
                onChange={(e) => maj('destination', e.target.value)}
                options={[
                  ...actives.map((d) => ({ valeur: d.id, libelle: d.name })),
                  { valeur: AUTRE, libelle: 'Autre établissement (à écrire)' },
                ]}
              />
            </Field>
          )}
          {autre && (
            <Field
              label={
                actives.length ? 'Nom de l’autre établissement' : 'Établissement de destination'
              }
              requis
              erreur={erreurs.autreNom}
            >
              <Input
                value={v.autreNom}
                maxLength={120}
                placeholder="Centre de santé de Kolda"
                onChange={(e) => maj('autreNom', e.target.value)}
              />
            </Field>
          )}
        </div>
        {autre && (
          <Checkbox
            label="Ajouter cet établissement à la liste"
            description="Il sera proposé aux prochaines références."
            checked={v.ajouterALaListe}
            onChange={(e) => maj('ajouterALaListe', e.target.checked)}
          />
        )}
        <Checkbox
          label="Référence urgente"
          description="« URGENT » est imprimé en tête de la lettre."
          checked={v.urgent}
          onChange={(e) => maj('urgent', e.target.checked)}
        />
        <Field label="Motif de la référence" requis erreur={erreurs.motif}>
          <Textarea
            rows={2}
            maxLength={LIMITES_REFERENCE.motif}
            value={v.motif}
            onChange={(e) => maj('motif', e.target.value)}
          />
        </Field>
        <Field
          label="Résumé clinique"
          aide="Pré-rempli depuis la consultation : motif, constantes, examen, examens rapides, diagnostic. Tout se modifie librement."
        >
          <Textarea
            rows={8}
            maxLength={LIMITES_REFERENCE.resume}
            value={v.resume}
            onChange={(e) => maj('resume', e.target.value)}
          />
        </Field>
        <Field
          label="Traitements reçus"
          aide="Pré-remplis depuis l’ordonnance, une ligne par médicament."
        >
          <Textarea
            rows={4}
            maxLength={LIMITES_REFERENCE.traitements}
            value={v.traitements}
            onChange={(e) => maj('traitements', e.target.value)}
          />
        </Field>

        {destinations.error && (
          <Message
            ton="erreur"
            action={<Button onClick={() => destinations.refetch()}>Réessayer</Button>}
          >
            <p>{destinations.error.message}</p>
          </Message>
        )}
        {!enLigne && (
          <Message ton="info" titre="Vous êtes hors ligne">
            <p>
              La saisie est gardée sur cet appareil. Émettez la lettre au retour de la connexion.
            </p>
          </Message>
        )}
        {echec && (
          <Message ton="erreur" titre="Lettre non émise">
            <p>{echec}</p>
            <p>Votre saisie est conservée sur cet appareil.</p>
          </Message>
        )}
      </form>
    </Modal>
  )
}
