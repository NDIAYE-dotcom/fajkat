import { useState } from 'react'
import Button from '../../../../components/ui/Button/Button.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import Modal from '../../../../components/ui/Modal/Modal.jsx'
import Skeleton from '../../../../components/ui/Skeleton/Skeleton.jsx'
import Tampon from '../../../../components/ui/Tampon/Tampon.jsx'
import { useEnLigne } from '../../../../hooks/useEnLigne.js'
import { formatDate, formatDateHeure } from '../../../../lib/format.js'
import { useReference } from '../../hooks/useDocuments.js'
import FormulaireContreReference from '../FormulaireContreReference/FormulaireContreReference.jsx'
import './FicheReference.css'

const ID = 'fiche-reference-contre'

function Bloc({ titre, texte }) {
  if (!texte?.trim()) return null
  return (
    <div className="fiche-reference__bloc">
      <h3 className="fiche-reference__titre">{titre}</h3>
      <p className="fiche-reference__texte">{texte}</p>
    </div>
  )
}

// Une référence (page Références) : la lettre émise, puis la contre-référence reçue, ou sa
// saisie. Lue à l'ouverture (lecture journalisée si la consultation est sensible).
export default function FicheReference({ referenceId, patientNom, onFermer, onEnregistree }) {
  const enLigne = useEnLigne()
  const requete = useReference(referenceId)
  const r = requete.data
  const [envoi, setEnvoi] = useState(false)
  const saisie = r && !r.counter_referral

  return (
    <Modal
      ouvert
      onFermer={onFermer}
      taille="large"
      fermerSurVoile={!saisie}
      titre={saisie ? 'Saisir la contre-référence' : 'Référence'}
      description={patientNom}
      actions={
        saisie ? (
          <Button type="submit" form={ID} chargement={envoi} disabled={!enLigne}>
            Enregistrer la contre-référence
          </Button>
        ) : null
      }
    >
      <div className="fiche-reference">
        {requete.isPending && <Skeleton forme="bloc" hauteur="8rem" />}
        {requete.error && (
          <Message
            ton="erreur"
            action={<Button onClick={() => requete.refetch()}>Réessayer</Button>}
          >
            <p>{requete.error.message}</p>
          </Message>
        )}
        {r && (
          <>
            <p className="fiche-reference__entete">
              <span>{`Vers ${r.destination_name} · ${formatDateHeure(r.referred_at)} · ${r.referrer_name}`}</span>
              {r.urgency === 'urgent' && <Tampon statut="urgent" />}
              {r.is_sensitive && <Tampon ton="encre">Pli confidentiel</Tampon>}
            </p>
            <Bloc titre="Motif de la référence" texte={r.reason} />
            <Bloc titre="Résumé clinique" texte={r.summary} />
            <Bloc titre="Traitements reçus" texte={r.treatments_given} />
            {r.counter_referral ? (
              <section className="fiche-reference__retour" aria-label="Contre-référence">
                <h3 className="fiche-reference__titre">
                  {`Contre-référence du ${formatDate(r.counter_referral_on)}`}
                </h3>
                {r.counter_from_name && (
                  <p className="fiche-reference__texte">{r.counter_from_name}</p>
                )}
                <Bloc titre="Diagnostic retenu" texte={r.counter_diagnosis} />
                <Bloc titre="Traitement" texte={r.counter_treatment} />
                <Bloc titre="Conduite à tenir" texte={r.counter_plan} />
                <Bloc titre="Suivi" texte={r.counter_followup} />
                {/* Contre-référence saisie avant les champs séparés : texte complet. */}
                {!r.counter_diagnosis &&
                  !r.counter_treatment &&
                  !r.counter_plan &&
                  !r.counter_followup && (
                    <p className="fiche-reference__texte">{r.counter_referral}</p>
                  )}
                <p className="fiche-reference__signature">
                  {`Saisie le ${formatDateHeure(r.counter_referral_at)} par ${r.counter_by_name}`}
                </p>
              </section>
            ) : (
              <FormulaireContreReference
                id={ID}
                reference={r}
                onEnvoi={setEnvoi}
                onEnregistree={onEnregistree}
              />
            )}
            {saisie && !enLigne && (
              <Message ton="info" titre="Vous êtes hors ligne">
                <p>La saisie est gardée sur cet appareil. Enregistrez au retour de la connexion.</p>
              </Message>
            )}
          </>
        )}
      </div>
    </Modal>
  )
}
