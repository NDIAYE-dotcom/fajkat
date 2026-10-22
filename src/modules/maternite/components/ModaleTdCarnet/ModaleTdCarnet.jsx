import { useState } from 'react'
import Button from '../../../../components/ui/Button/Button.jsx'
import DateInput from '../../../../components/ui/DateInput/DateInput.jsx'
import Field from '../../../../components/ui/Field/Field.jsx'
import Input from '../../../../components/ui/Input/Input.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import Modal from '../../../../components/ui/Modal/Modal.jsx'
import Select from '../../../../components/ui/Select/Select.jsx'
import { useBrouillon } from '../../../../hooks/useBrouillon.js'
import { useEnLigne } from '../../../../hooks/useEnLigne.js'
import { formatHeure, lireDateFr } from '../../../../lib/format.js'
import { noterTdCarnet, nouvelIdentifiant } from '../../api.js'
import { aujourdhuiStructure } from '../../grossesse.js'
import { dateCarnet, MOIS_OPTIONS, PRECISIONS } from '../../soins.js'
import './ModaleTdCarnet.css'

const ID = 'td-carnet'

// Dose de Td reçue avant la grossesse ou ailleurs, vue sur le carnet. Date au jour près, au
// mois ou à l'année : la base la ramène au premier jour possible (lecture prudente) et
// garde la précision pour l'affichage. Identifiant d'envoi gardé dans le brouillon : un
// envoi répété après une coupure ne crée pas de seconde dose.
export default function ModaleTdCarnet({
  patientId,
  rangPropose,
  rangsPris,
  total,
  onFermer,
  onNotee,
}) {
  const enLigne = useEnLigne()
  const brouillon = useBrouillon(`td.carnet.${patientId}`, {
    identifiant: nouvelIdentifiant(),
    rang: String(rangPropose),
    precision: 'day',
    jour: '',
    mois: '',
    annee: '',
    lieu: '',
  })
  const s = brouillon.valeur
  const [erreurs, setErreurs] = useState({})
  const [envoi, setEnvoi] = useState(false)
  const [echec, setEchec] = useState(null)

  function maj(champ, valeur) {
    brouillon.setValeur((p) => ({ ...p, [champ]: valeur }))
    setErreurs({})
    setEchec(null)
  }

  async function envoyer(evenement) {
    evenement.preventDefault()
    const date = dateCarnet(s.precision, lireDateFr(s.jour), s.mois, s.annee.trim())
    const trouvees = {}
    if (s.precision === 'day' && !lireDateFr(s.jour))
      trouvees.date = 'Date incomplète ou inexistante : JJ/MM/AAAA.'
    else if (s.precision !== 'day' && !/^\d{4}$/.test(s.annee.trim()))
      trouvees.date = 'Tapez l’année en quatre chiffres, par exemple 2024.'
    else if (s.precision === 'month' && !s.mois) trouvees.date = 'Choisissez le mois.'
    else if (date > aujourdhuiStructure()) trouvees.date = 'La date ne peut pas être dans le futur.'
    setErreurs(trouvees)
    if (trouvees.date) return
    setEnvoi(true)
    try {
      await noterTdCarnet(
        patientId,
        Number(s.rang),
        date,
        s.precision,
        s.lieu.trim(),
        null,
        s.identifiant,
      )
      brouillon.effacer()
      onNotee()
    } catch (e) {
      if (/date|futur/i.test(e.message)) setErreurs({ date: e.message })
      else if (/déjà notée|dose/i.test(e.message)) setErreurs({ rang: e.message })
      else setEchec(e.message)
    } finally {
      setEnvoi(false)
    }
  }

  const rangs = Array.from({ length: total || 5 }, (_, i) => i + 1).filter(
    (r) => !rangsPris.includes(r),
  )
  return (
    <Modal
      ouvert
      onFermer={onFermer}
      fermerSurVoile={false}
      titre="Noter un Td d’après le carnet"
      description="Dose reçue avant la grossesse ou dans une autre structure. Si le carnet ne donne que le mois ou l’année, choisissez-le : rien n’est inventé."
      actions={
        <Button type="submit" form={ID} chargement={envoi} disabled={!enLigne}>
          Noter la dose
        </Button>
      }
    >
      <form id={ID} className="td-carnet" noValidate onSubmit={envoyer}>
        {brouillon.restaure && brouillon.enregistreLe && (
          <Message ton="info">
            <p>Votre saisie de {formatHeure(brouillon.enregistreLe)} a été retrouvée.</p>
          </Message>
        )}
        <Field id={`${ID}-rang`} label="Dose" requis erreur={erreurs.rang}>
          <Select
            value={s.rang}
            options={rangs.map((r) => ({ valeur: String(r), libelle: `Td ${r}` }))}
            onChange={(e) => maj('rang', e.target.value)}
          />
        </Field>
        <Field id={`${ID}-precision`} label="Ce que dit le carnet">
          <Select
            value={s.precision}
            options={PRECISIONS}
            onChange={(e) => maj('precision', e.target.value)}
          />
        </Field>
        {s.precision === 'day' && (
          <Field id={`${ID}-date`} label="Date de la dose" requis erreur={erreurs.date}>
            <DateInput
              value={{ type: 'date', date: lireDateFr(s.jour), texte: s.jour }}
              onChange={(d) => maj('jour', d.texte)}
            />
          </Field>
        )}
        {s.precision !== 'day' && (
          <div className="td-carnet__periode">
            {s.precision === 'month' && (
              <Field id={`${ID}-mois`} label="Mois" requis>
                <Select
                  value={s.mois}
                  options={[{ valeur: '', libelle: 'Choisir' }, ...MOIS_OPTIONS]}
                  onChange={(e) => maj('mois', e.target.value)}
                />
              </Field>
            )}
            <Field id={`${ID}-annee`} label="Année" requis erreur={erreurs.date}>
              <Input
                mono
                inputMode="numeric"
                maxLength={4}
                value={s.annee}
                onChange={(e) => maj('annee', e.target.value.replace(/\D/g, ''))}
              />
            </Field>
          </div>
        )}
        <Field id={`${ID}-lieu`} label="Lieu" facultatif aide="Exemple : Centre de santé de Kolda.">
          <Input maxLength={120} value={s.lieu} onChange={(e) => maj('lieu', e.target.value)} />
        </Field>
        {!enLigne && (
          <Message ton="info">
            <p>Pas de connexion : votre saisie reste sur cet appareil.</p>
          </Message>
        )}
        {echec && (
          <Message ton="erreur" titre="La dose n’a pas été notée">
            <p>{echec}</p>
            <p>Votre saisie est conservée sur cet appareil.</p>
          </Message>
        )}
      </form>
    </Modal>
  )
}
