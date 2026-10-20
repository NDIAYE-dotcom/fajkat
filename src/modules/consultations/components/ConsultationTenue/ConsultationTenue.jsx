import { UserRoundCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import Button from '../../../../components/ui/Button/Button.jsx'
import Icone from '../../../../components/ui/Icone/Icone.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import Modal from '../../../../components/ui/Modal/Modal.jsx'
import { formatHeure } from '../../../../lib/format.js'
import { ilYa } from '../../utils.js'
import './ConsultationTenue.css'

// Brouillon tenu par un autre soignant : qui, depuis quand, dernier enregistrement. La
// reprise (relève de garde) se confirme : le collègue est peut-être encore en train
// d'écrire. Son contenu reste invisible tant qu'il n'est pas repris.
export default function ConsultationTenue({ consultation, peutReprendre, enLigne, onReprendre }) {
  const [confirmation, setConfirmation] = useState(false)
  const [envoi, setEnvoi] = useState(false)
  const [echec, setEchec] = useState(null)
  const [maintenant, setMaintenant] = useState(() => new Date())

  // L'heure relative (« il y a 20 secondes ») avance toute seule.
  useEffect(() => {
    const t = setInterval(() => setMaintenant(new Date()), 5000)
    return () => clearInterval(t)
  }, [])

  const auteur = consultation.author_name
  const dernier = ilYa(consultation.updated_at, maintenant)
  const recent = maintenant.getTime() - new Date(consultation.updated_at).getTime() < 5 * 60 * 1000

  async function reprendre() {
    setEnvoi(true)
    setEchec(null)
    try {
      await onReprendre()
    } catch (e) {
      setEchec(e.message)
      setEnvoi(false)
    }
  }

  return (
    <section className="consultation-tenue" aria-labelledby="consultation-tenue-titre">
      <Icone icone={UserRoundCheck} className="consultation-tenue__icone" />
      <h2 id="consultation-tenue-titre" className="consultation-tenue__titre">
        {`Consultation commencée par ${auteur} à ${formatHeure(consultation.started_at)}`}
      </h2>
      <p className="consultation-tenue__texte">
        {`Dernier enregistrement de ${auteur} : ${dernier}.`} Le brouillon reste réservé à son
        auteur tant que la consultation n’est pas reprise.
      </p>
      {peutReprendre ? (
        <Button onClick={() => setConfirmation(true)} disabled={!enLigne}>
          Reprendre la consultation
        </Button>
      ) : (
        <p className="consultation-tenue__texte">
          Seuls le médecin, la sage-femme, l’infirmier, ou le responsable qui exerce, peuvent la
          reprendre.
        </p>
      )}
      {!enLigne && <p className="consultation-tenue__texte">La reprise demande une connexion.</p>}
      <Modal
        ouvert={confirmation}
        onFermer={() => setConfirmation(false)}
        titre="Reprendre la consultation ?"
        actions={
          <>
            <Button variante="discret" onClick={() => setConfirmation(false)}>
              Ne pas reprendre
            </Button>
            <Button chargement={envoi} disabled={!enLigne} onClick={reprendre}>
              Reprendre la consultation
            </Button>
          </>
        }
      >
        <p>{`${auteur} a enregistré ${dernier}.`}</p>
        {recent && (
          <Message ton="info" titre={`${auteur} est peut-être encore en train d’écrire`}>
            <p>Vérifiez auprès de votre collègue avant de reprendre.</p>
          </Message>
        )}
        <p>
          Vous continuerez la consultation avec tout ce qui a déjà été saisi. {auteur} ne pourra
          plus la modifier et recevra une notification. La reprise est enregistrée dans le dossier.
        </p>
        {echec && (
          <Message ton="erreur">
            <p>{echec}</p>
          </Message>
        )}
      </Modal>
    </section>
  )
}
