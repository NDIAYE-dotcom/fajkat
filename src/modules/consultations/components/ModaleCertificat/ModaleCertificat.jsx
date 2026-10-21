import dayjs from 'dayjs'
import { useState } from 'react'
import Button from '../../../../components/ui/Button/Button.jsx'
import DateInput from '../../../../components/ui/DateInput/DateInput.jsx'
import Field from '../../../../components/ui/Field/Field.jsx'
import Input from '../../../../components/ui/Input/Input.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import Modal from '../../../../components/ui/Modal/Modal.jsx'
import Select from '../../../../components/ui/Select/Select.jsx'
import Skeleton from '../../../../components/ui/Skeleton/Skeleton.jsx'
import Textarea from '../../../../components/ui/Textarea/Textarea.jsx'
import { useAuth } from '../../../../hooks/useAuth.js'
import { useBrouillon } from '../../../../hooks/useBrouillon.js'
import { useEnLigne } from '../../../../hooks/useEnLigne.js'
import { useOrganization } from '../../../../hooks/useOrganization.js'
import { getFuseauHoraire } from '../../../../lib/format.js'
import BrouillonRetrouve from '../../../accueil/components/BrouillonRetrouve/BrouillonRetrouve.jsx'
import { versDateInput } from '../../../rendez-vous/utils.js'
import { emettreCertificat } from '../../api.js'
import {
  CERTIFICAT_MAX,
  erreurTexteCertificat,
  remplirModele,
  variablesCertificat,
} from '../../documents.js'
import { useModelesCertificat } from '../../hooks/useDocuments.js'
import './ModaleCertificat.css'

const ID = 'modale-certificat'

// Certificat depuis la consultation (repos, aptitude, certificat médical) : modèle de la
// structure complété (patient, dates du repos…), texte relu et modifiable avant l'émission.
// Jamais de diagnostic inséré : aucune variable n'en porte, et rien du contenu médical
// n'est lu ici. À l'émission, la base donne le numéro ; le certificat ne se modifie plus.
export default function ModaleCertificat({ consultation, patient, sensible, onFermer, onEmis }) {
  const { structure } = useOrganization()
  const { nomComplet } = useAuth()
  const enLigne = useEnLigne()
  const modeles = useModelesCertificat(structure.id)
  const actifs = (modeles.data ?? []).filter((m) => m.is_active)
  const [initial] = useState(() => ({
    modeleId: '',
    titre: '',
    jours: '',
    debut: versDateInput(dayjs().tz(getFuseauHoraire()).format('YYYY-MM-DD')),
    texte: '',
    modifie: false,
  }))
  const brouillon = useBrouillon(`consultation.${consultation.id}.certificat`, initial)
  const v = brouillon.valeur
  const modele = actifs.find((m) => m.id === v.modeleId)
  const [erreurs, setErreurs] = useState({})
  const [echec, setEchec] = useState(null)
  const [envoi, setEnvoi] = useState(false)

  // Texte du modèle complété avec les valeurs du moment.
  function texteDuModele(m, jours, debut) {
    if (!m) return ''
    const n = Number(jours)
    return remplirModele(
      m.body,
      variablesCertificat({
        patient,
        structure: structure.name,
        praticien: nomComplet,
        jours: m.has_days && Number.isInteger(n) && n > 0 ? n : null,
        debut: m.has_days ? debut?.date : null,
      }),
    )
  }

  // Modèle, jours ou début changés : le texte suit, tant qu'il n'a pas été retouché.
  function maj(champs) {
    brouillon.setValeur((p) => {
      const s = { ...p, ...champs }
      const m = actifs.find((x) => x.id === s.modeleId)
      if ('modeleId' in champs) s.titre = m?.label ?? ''
      if (!s.modifie || 'modeleId' in champs) {
        s.texte = texteDuModele(m, s.jours, s.debut)
        s.modifie = false
      }
      return s
    })
    setErreurs({})
    setEchec(null)
  }

  function verifier() {
    const e = {}
    if (!modele) e.modeleId = 'Choisissez le modèle de certificat.'
    if (v.titre.trim().length < 2) e.titre = 'Indiquez le titre du certificat.'
    if (modele?.has_days) {
      const n = Number(v.jours)
      if (!v.jours) e.jours = 'Indiquez le nombre de jours de repos.'
      else if (!Number.isInteger(n) || n < 1 || n > 365) e.jours = 'Tapez un nombre de 1 à 365.'
      if (!v.debut?.date) e.debut = 'Tapez la date du premier jour (JJ/MM/AAAA).'
    }
    const texte = erreurTexteCertificat(v.texte)
    if (texte) e.texte = texte
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
    try {
      const id = await emettreCertificat(consultation.id, {
        modeleId: modele.id,
        titre: v.titre,
        texte: v.texte,
        jours: modele.has_days ? Number(v.jours) : null,
        debut: modele.has_days ? v.debut.date : null,
      })
      brouillon.effacer()
      onEmis(id)
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
      titre="Certificat"
      description="Relisez le texte : un certificat émis reçoit un numéro et ne se modifie plus."
      actions={
        <Button type="submit" form={ID} chargement={envoi} disabled={!enLigne || !modeles.data}>
          Émettre et imprimer
        </Button>
      }
    >
      <form id={ID} className="modale-certificat" noValidate onSubmit={emettre}>
        <BrouillonRetrouve brouillon={brouillon} onEffacer={() => setErreurs({})} />
        {sensible && (
          <Message ton="info" titre="Consultation sensible">
            <p>
              N’écrivez rien sur le certificat qui révèle le motif ou le soin de cette consultation.
            </p>
          </Message>
        )}
        {modeles.isPending && <Skeleton forme="bloc" hauteur="6rem" />}
        {modeles.error && (
          <Message
            ton="erreur"
            action={<Button onClick={() => modeles.refetch()}>Réessayer</Button>}
          >
            <p>{modeles.error.message}</p>
          </Message>
        )}
        {modeles.data && (
          <>
            <div className="modale-certificat__ligne">
              <Field label="Modèle" requis erreur={erreurs.modeleId}>
                <Select
                  value={v.modeleId}
                  placeholder="Choisissez un modèle"
                  onChange={(e) => maj({ modeleId: e.target.value })}
                  options={actifs.map((m) => ({ valeur: m.id, libelle: m.label }))}
                />
              </Field>
              <Field label="Titre imprimé" requis erreur={erreurs.titre}>
                <Input
                  value={v.titre}
                  maxLength={80}
                  onChange={(e) => brouillon.setValeur((p) => ({ ...p, titre: e.target.value }))}
                />
              </Field>
            </div>
            {modele?.has_days && (
              <div className="modale-certificat__ligne">
                <Field label="Jours de repos" requis erreur={erreurs.jours}>
                  <Input
                    inputMode="numeric"
                    value={v.jours}
                    maxLength={3}
                    onChange={(e) => maj({ jours: e.target.value.replace(/\D/g, '') })}
                  />
                </Field>
                <Field label="Premier jour du repos" requis erreur={erreurs.debut}>
                  <DateInput value={v.debut} onChange={(d) => maj({ debut: d })} />
                </Field>
              </div>
            )}
            {modele && (
              <Field
                label="Texte du certificat"
                requis
                erreur={erreurs.texte}
                aide="Aucun diagnostic n’est ajouté. Complétez les « …… » avant d’émettre."
              >
                <Textarea
                  rows={10}
                  maxLength={CERTIFICAT_MAX}
                  value={v.texte}
                  onChange={(e) =>
                    brouillon.setValeur((p) => ({ ...p, texte: e.target.value, modifie: true }))
                  }
                />
              </Field>
            )}
            {modele && v.modifie && (
              <div className="modale-certificat__retouche">
                <p>Texte retouché : les jours et les dates ne s’y mettent plus à jour.</p>
                <Button variante="discret" onClick={() => maj({ modifie: false })}>
                  Reprendre le texte du modèle
                </Button>
              </div>
            )}
          </>
        )}
        {!enLigne && (
          <Message ton="info" titre="Vous êtes hors ligne">
            <p>
              La saisie est gardée sur cet appareil. Émettez le certificat au retour de la
              connexion.
            </p>
          </Message>
        )}
        {echec && (
          <Message ton="erreur" titre="Certificat non émis">
            <p>{echec}</p>
            <p>Votre saisie est conservée sur cet appareil.</p>
          </Message>
        )}
      </form>
    </Modal>
  )
}
