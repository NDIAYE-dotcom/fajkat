import { useState } from 'react'
import Button from '../../../../components/ui/Button/Button.jsx'
import DateInput from '../../../../components/ui/DateInput/DateInput.jsx'
import Field from '../../../../components/ui/Field/Field.jsx'
import Input from '../../../../components/ui/Input/Input.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import PhoneInput from '../../../../components/ui/PhoneInput/PhoneInput.jsx'
import Select from '../../../../components/ui/Select/Select.jsx'
import { useBrouillon } from '../../../../hooks/useBrouillon.js'
import { formatDate, formatHeure, lireDateFr } from '../../../../lib/format.js'
import { estTelephoneValide } from '../../../../lib/pays.js'
import { modifierFiche } from '../../api.js'
import { CONTRATS, libelleContrat } from '../../utils.js'
import './FormulaireFiche.css'

function valeursDe(fiche) {
  return {
    job_title: fiche.job_title ?? '',
    professional_number: fiche.professional_number ?? '',
    phone: fiche.phone ?? '',
    start_date: fiche.start_date ? formatDate(fiche.start_date) : '',
    contract_type: fiche.contract_type ?? '',
    emergency_contact_name: fiche.emergency_contact_name ?? '',
    emergency_contact_phone: fiche.emergency_contact_phone ?? '',
  }
}

function valider(v) {
  const erreurs = {}
  for (const champ of ['phone', 'emergency_contact_phone']) {
    if (v[champ] && !estTelephoneValide(v[champ]))
      erreurs[champ] = 'Numéro incomplet : vérifiez le nombre de chiffres.'
  }
  if (v.start_date && !lireDateFr(v.start_date))
    erreurs.start_date = 'Date incomplète ou inexistante : JJ/MM/AAAA, par exemple 05/01/2026.'
  return erreurs
}

// Fiche d'un membre. complet : owner ou admin, tous les champs ; sinon, le membre ne
// modifie que son téléphone et son contact d'urgence (règle tenue aussi par la base).
// Le parent remonte le composant (key) après chaque enregistrement.
export default function FormulaireFiche({ fiche, complet, onEnregistre }) {
  const [initiale] = useState(() => valeursDe(fiche))
  const brouillon = useBrouillon(`personnel.fiche.${fiche.id}`, initiale)
  const v = brouillon.valeur
  const [erreurs, setErreurs] = useState({})
  const [envoi, setEnvoi] = useState(false)
  const [erreurEnvoi, setErreurEnvoi] = useState(null)
  const id = (champ) => `fiche-${fiche.id}-${champ}`

  function maj(champ, valeur) {
    brouillon.setValeur((precedente) => ({ ...precedente, [champ]: valeur }))
    setErreurs((e) => ({ ...e, [champ]: undefined }))
  }
  const texte = (champ) => (evenement) => maj(champ, evenement.target.value)

  async function surEnvoi(evenement) {
    evenement.preventDefault()
    const trouvees = valider(v)
    setErreurs(trouvees)
    const premiere = Object.keys(trouvees)[0]
    if (premiere) return document.getElementById(id(premiere))?.focus()
    setEnvoi(true)
    setErreurEnvoi(null)
    const nettoye = (valeur) => valeur.trim() || null
    const champs = {
      phone: v.phone || null,
      emergency_contact_name: nettoye(v.emergency_contact_name),
      emergency_contact_phone: v.emergency_contact_phone || null,
    }
    if (complet) {
      Object.assign(champs, {
        job_title: nettoye(v.job_title),
        professional_number: nettoye(v.professional_number),
        start_date: v.start_date ? lireDateFr(v.start_date) : null,
        contract_type: v.contract_type || null,
      })
    }
    try {
      const enregistree = await modifierFiche(fiche.id, champs)
      brouillon.effacer()
      onEnregistre(enregistree)
    } catch (e) {
      setErreurEnvoi(e.message)
      setEnvoi(false)
    }
  }

  return (
    <form className="formulaire-fiche" noValidate onSubmit={surEnvoi}>
      {brouillon.restaure && brouillon.enregistreLe && (
        <Message ton="info">
          <p>Votre saisie de {formatHeure(brouillon.enregistreLe)} a été retrouvée.</p>
          <Button variante="discret" onClick={brouillon.effacer}>
            Revenir aux informations enregistrées
          </Button>
        </Message>
      )}

      <fieldset className="formulaire-fiche__groupe">
        <legend className="formulaire-fiche__legende">Poste</legend>
        {complet ? (
          <div className="formulaire-fiche__grille">
            <Field id={id('job_title')} label="Fonction" facultatif aide="Par exemple « Matrone ».">
              <Input value={v.job_title} maxLength={120} onChange={texte('job_title')} />
            </Field>
            <Field id={id('professional_number')} label="Numéro d’ordre professionnel" facultatif>
              <Input
                mono
                value={v.professional_number}
                maxLength={60}
                onChange={texte('professional_number')}
              />
            </Field>
            <Field
              id={id('start_date')}
              label="Date d’entrée"
              facultatif
              erreur={erreurs.start_date}
            >
              <DateInput
                value={{ type: 'date', date: lireDateFr(v.start_date), texte: v.start_date }}
                onChange={(valeur) => maj('start_date', valeur.texte)}
              />
            </Field>
            <Field id={id('contract_type')} label="Type de contrat" facultatif>
              <Select
                value={v.contract_type}
                placeholder="Non renseigné"
                options={CONTRATS}
                onChange={texte('contract_type')}
              />
            </Field>
          </div>
        ) : (
          <dl className="formulaire-fiche__lecture">
            <Ligne terme="Fonction" valeur={fiche.job_title} />
            <Ligne terme="Numéro d’ordre" valeur={fiche.professional_number} mono />
            <Ligne
              terme="Date d’entrée"
              valeur={fiche.start_date && formatDate(fiche.start_date)}
              mono
            />
            <Ligne terme="Contrat" valeur={libelleContrat(fiche.contract_type)} />
          </dl>
        )}
        {!complet && (
          <p className="formulaire-fiche__note">
            Une erreur ? Demandez au responsable de la structure de la corriger.
          </p>
        )}
      </fieldset>

      <fieldset className="formulaire-fiche__groupe">
        <legend className="formulaire-fiche__legende">Joindre la personne</legend>
        <Field
          id={id('phone')}
          label="Téléphone"
          facultatif
          aide="Numéro utilisé par cette structure (planning, rappels de garde)."
          erreur={erreurs.phone}
        >
          <PhoneInput value={v.phone} onChange={(valeur) => maj('phone', valeur)} />
        </Field>
        <div className="formulaire-fiche__grille">
          <Field id={id('emergency_contact_name')} label="Contact d’urgence" facultatif>
            <Input
              autoComplete="off"
              value={v.emergency_contact_name}
              maxLength={160}
              onChange={texte('emergency_contact_name')}
            />
          </Field>
          <Field
            id={id('emergency_contact_phone')}
            label="Téléphone du contact d’urgence"
            facultatif
            erreur={erreurs.emergency_contact_phone}
          >
            <PhoneInput
              value={v.emergency_contact_phone}
              onChange={(valeur) => maj('emergency_contact_phone', valeur)}
            />
          </Field>
        </div>
      </fieldset>

      {erreurEnvoi && (
        <Message ton="erreur" titre="L’enregistrement n’a pas abouti">
          <p>{erreurEnvoi}</p>
          <p>Votre saisie est conservée sur cet appareil.</p>
        </Message>
      )}

      <div>
        <Button type="submit" chargement={envoi}>
          Enregistrer la fiche
        </Button>
      </div>
    </form>
  )
}

function Ligne({ terme, valeur, mono = false }) {
  return (
    <div className="formulaire-fiche__ligne">
      <dt>{terme}</dt>
      <dd className={mono && valeur ? 'formulaire-fiche__mono' : undefined}>
        {valeur || 'Non renseigné'}
      </dd>
    </div>
  )
}
