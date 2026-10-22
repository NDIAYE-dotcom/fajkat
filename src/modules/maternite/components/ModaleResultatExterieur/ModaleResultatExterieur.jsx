import { useState } from 'react'
import Button from '../../../../components/ui/Button/Button.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import Modal from '../../../../components/ui/Modal/Modal.jsx'
import { useBrouillon } from '../../../../hooks/useBrouillon.js'
import { useEnLigne } from '../../../../hooks/useEnLigne.js'
import { formatHeure } from '../../../../lib/format.js'
import { lireNombre } from '../../../consultations/utils.js'
import { noterResultatExterieur, nouvelIdentifiant } from '../../api.js'
import { aujourdhuiStructure } from '../../grossesse.js'
import ChampsResultat from '../ChampsResultat/ChampsResultat.jsx'
import './ModaleResultatExterieur.css'

const ID = 'resultat-exterieur'

// Résultat d'un laboratoire extérieur, d'après le papier apporté par la patiente (onglet
// Grossesse). Sans lui, l'examen resterait « À faire » à tort. Brouillon et identifiant
// d'envoi gardés sur l'appareil.
export default function ModaleResultatExterieur({ grossesseId, examens, onFermer, onNote }) {
  const enLigne = useEnLigne()
  const brouillon = useBrouillon(`resultat.exterieur.${grossesseId}`, {
    identifiant: nouvelIdentifiant(),
    rapid_test_type_id: '',
    taken_on: null,
    taken_on_texte: '',
    lab_name: '',
    result: null,
    value_number: '',
    value_text: '',
  })
  const s = brouillon.valeur
  const [erreurs, setErreurs] = useState({})
  const [envoi, setEnvoi] = useState(false)
  const [echec, setEchec] = useState(null)
  const type = examens.find((e) => e.id === s.rapid_test_type_id)

  async function envoyer(evenement) {
    evenement.preventDefault()
    const trouvees = {}
    const valeur = lireNombre(s.value_number)
    if (!type) trouvees.examen = 'Choisissez l’examen.'
    if (!s.taken_on) trouvees.date = 'Indiquez la date de l’examen : JJ/MM/AAAA.'
    else if (s.taken_on > aujourdhuiStructure())
      trouvees.date = 'La date ne peut pas être dans le futur.'
    if (s.lab_name.trim().length < 2) trouvees.labo = 'Indiquez le laboratoire.'
    if (type?.result_kind === 'binary' && !s.result) trouvees.resultat = 'Choisissez le résultat.'
    if (type?.result_kind === 'number' && (valeur === null || Number.isNaN(valeur)))
      trouvees.resultat = 'Tapez la valeur, par exemple 10,5.'
    if (type?.result_kind === 'text' && !s.value_text.trim())
      trouvees.resultat = 'Écrivez le résultat.'
    setErreurs(trouvees)
    if (Object.keys(trouvees).length) return
    setEnvoi(true)
    setEchec(null)
    try {
      await noterResultatExterieur(
        grossesseId,
        {
          ...s,
          value_number: type.result_kind === 'number' ? valeur : null,
          lab_name: s.lab_name.trim(),
        },
        s.identifiant,
      )
      brouillon.effacer()
      onNote()
    } catch (e) {
      if (/date/i.test(e.message)) setErreurs({ date: e.message })
      else if (/laboratoire/i.test(e.message)) setErreurs({ labo: e.message })
      else setEchec(e.message)
    } finally {
      setEnvoi(false)
    }
  }

  return (
    <Modal
      ouvert
      onFermer={onFermer}
      fermerSurVoile={false}
      titre="Noter un résultat d’un laboratoire"
      description="D’après le papier du laboratoire apporté par la patiente."
      actions={
        <Button type="submit" form={ID} chargement={envoi} disabled={!enLigne}>
          Noter le résultat
        </Button>
      }
    >
      <form id={ID} className="resultat-exterieur" noValidate onSubmit={envoyer}>
        {brouillon.restaure && brouillon.enregistreLe && (
          <Message ton="info">
            <p>Votre saisie de {formatHeure(brouillon.enregistreLe)} a été retrouvée.</p>
          </Message>
        )}
        <ChampsResultat
          prefixe={ID}
          examens={examens}
          valeur={s}
          erreurs={erreurs}
          onChange={(champs) => {
            brouillon.setValeur((p) => ({ ...p, ...champs }))
            setErreurs({})
            setEchec(null)
          }}
        />
        {!enLigne && (
          <Message ton="info">
            <p>Pas de connexion : votre saisie reste sur cet appareil.</p>
          </Message>
        )}
        {echec && (
          <Message ton="erreur" titre="Le résultat n’a pas été noté">
            <p>{echec}</p>
            <p>Votre saisie est conservée sur cet appareil.</p>
          </Message>
        )}
      </form>
    </Modal>
  )
}
