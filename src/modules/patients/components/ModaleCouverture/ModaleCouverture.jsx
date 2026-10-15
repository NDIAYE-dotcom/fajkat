import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import Button from '../../../../components/ui/Button/Button.jsx'
import DateInput from '../../../../components/ui/DateInput/DateInput.jsx'
import Field from '../../../../components/ui/Field/Field.jsx'
import Input from '../../../../components/ui/Input/Input.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import Modal from '../../../../components/ui/Modal/Modal.jsx'
import Select from '../../../../components/ui/Select/Select.jsx'
import { useEnLigne } from '../../../../hooks/useEnLigne.js'
import { formatDate, lireDateFr } from '../../../../lib/format.js'
import { chargerTiersPayants, cles, enregistrerCouverture } from '../../api.js'
import { REGIMES } from '../../fiche.js'
import './ModaleCouverture.css'

const ID = 'couverture'

function saisieDe(c) {
  return {
    regime: c?.scheme ?? '',
    tiers: c?.payer_id ?? '',
    numero: c?.member_number ?? '',
    taux:
      c?.coverage_rate === null || c?.coverage_rate === undefined ? '' : String(c.coverage_rate),
    debut: c?.valid_from ? formatDate(c.valid_from) : '',
    fin: c?.valid_to ? formatDate(c.valid_to) : '',
  }
}

// Ajout ou modification d'une couverture. Le taux, s'il est laissé vide, est repris du
// tiers payant choisi (convention de la structure) ; aucune valeur n'est supposée.
export default function ModaleCouverture({ patient, couverture, onFermer, onEnregistre }) {
  const enLigne = useEnLigne()
  const [v, setV] = useState(() => saisieDe(couverture))
  const [erreurs, setErreurs] = useState({})
  const [envoi, setEnvoi] = useState(false)
  const [echec, setEchec] = useState(null)
  const tiersPayants = useQuery({
    queryKey: cles.tiersPayants(patient.org_id),
    queryFn: () => chargerTiersPayants(patient.org_id),
  })

  const regime = REGIMES.find((r) => r.valeur === v.regime)
  const proposes = (tiersPayants.data ?? []).filter((t) => t.kind === v.regime)
  const tiersChoisi = proposes.find((t) => t.id === v.tiers)

  function maj(champ, valeur) {
    setV((p) => ({ ...p, [champ]: valeur, ...(champ === 'regime' ? { tiers: '' } : {}) }))
    setErreurs((e) => ({ ...e, [champ]: undefined }))
    setEchec(null)
  }

  async function surEnvoi(evenement) {
    evenement.preventDefault()
    const debut = lireDateFr(v.debut)
    const fin = lireDateFr(v.fin)
    const taux = v.taux === '' ? null : Number(v.taux)
    const trouvees = {}
    if (!v.regime) trouvees.regime = 'Choisissez le régime.'
    if (taux !== null && !(Number.isInteger(taux) && taux >= 0 && taux <= 100)) {
      trouvees.taux = 'Indiquez un pourcentage entier, de 0 à 100.'
    }
    if (v.debut && !debut) trouvees.debut = 'Date incomplète : JJ/MM/AAAA.'
    if (v.fin && !fin) trouvees.fin = 'Date incomplète : JJ/MM/AAAA.'
    else if (debut && fin && fin < debut) trouvees.fin = 'La fin doit suivre le début.'
    setErreurs(trouvees)
    const premiere = ['regime', 'taux', 'debut', 'fin'].find((c) => trouvees[c])
    if (premiere) {
      document.getElementById(`${ID}-${premiere}`)?.focus()
      return
    }
    setEnvoi(true)
    setEchec(null)
    try {
      await enregistrerCouverture(
        patient,
        {
          scheme: v.regime,
          payer_id: regime?.tiers && v.tiers ? v.tiers : null,
          member_number: v.numero.trim() || null,
          coverage_rate: taux,
          valid_from: debut,
          valid_to: fin,
        },
        couverture?.id,
      )
      onEnregistre()
    } catch (e) {
      setEchec(e.message)
    } finally {
      setEnvoi(false)
    }
  }

  const tauxRepris = tiersChoisi?.coverage_rate
  return (
    <Modal
      ouvert
      onFermer={onFermer}
      fermerSurVoile={false}
      titre={couverture ? 'Modifier la couverture' : 'Ajouter une couverture'}
      actions={
        <Button type="submit" form={ID} chargement={envoi} disabled={!enLigne}>
          Enregistrer
        </Button>
      }
    >
      <form id={ID} className="modale-couverture" noValidate onSubmit={surEnvoi}>
        <Field id={`${ID}-regime`} label="Régime" requis erreur={erreurs.regime}>
          <Select
            placeholder="Choisir"
            options={REGIMES}
            value={v.regime}
            onChange={(e) => maj('regime', e.target.value)}
          />
        </Field>
        {regime?.tiers && (
          <Field
            id={`${ID}-tiers`}
            label="Organisme (tiers payant)"
            facultatif
            aide={
              proposes.length === 0 && !tiersPayants.isPending
                ? 'Aucun organisme de ce régime dans les paramètres de la structure.'
                : null
            }
          >
            <Select
              placeholder="Non précisé"
              options={proposes.map((t) => ({ valeur: t.id, libelle: t.name }))}
              value={v.tiers}
              onChange={(e) => maj('tiers', e.target.value)}
            />
          </Field>
        )}
        <div className="modale-couverture__ligne">
          <Field id={`${ID}-numero`} label="N° d’assuré ou de carte" facultatif>
            <Input
              mono
              autoComplete="off"
              maxLength={60}
              value={v.numero}
              onChange={(e) => maj('numero', e.target.value)}
            />
          </Field>
          <Field
            id={`${ID}-taux`}
            label="Part prise en charge"
            facultatif
            erreur={erreurs.taux}
            aide={
              tauxRepris !== null && tauxRepris !== undefined
                ? `Vide : ${tauxRepris} %, taux de l’organisme.`
                : 'Vide : taux de l’organisme, s’il est renseigné.'
            }
          >
            <Input
              mono
              inputMode="numeric"
              maxLength={3}
              suffixe="%"
              value={v.taux}
              onChange={(e) => maj('taux', e.target.value.replace(/\D/g, ''))}
            />
          </Field>
        </div>
        <div className="modale-couverture__ligne">
          <Field id={`${ID}-debut`} label="Valable du" facultatif erreur={erreurs.debut}>
            <DateInput
              value={{ type: 'date', date: lireDateFr(v.debut), texte: v.debut }}
              onChange={(d) => maj('debut', d.texte)}
            />
          </Field>
          <Field id={`${ID}-fin`} label="Jusqu’au" facultatif erreur={erreurs.fin}>
            <DateInput
              value={{ type: 'date', date: lireDateFr(v.fin), texte: v.fin }}
              onChange={(d) => maj('fin', d.texte)}
            />
          </Field>
        </div>
        {echec && (
          <Message ton="erreur" titre="Couverture non enregistrée">
            <p>{echec}</p>
          </Message>
        )}
      </form>
    </Modal>
  )
}
