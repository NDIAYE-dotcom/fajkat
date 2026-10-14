import { useState } from 'react'
import Button from '../../../../components/ui/Button/Button.jsx'
import Field from '../../../../components/ui/Field/Field.jsx'
import Input from '../../../../components/ui/Input/Input.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import PhoneInput from '../../../../components/ui/PhoneInput/PhoneInput.jsx'
import { envoyerCodeSms, verifierCodeSms } from '../../../../lib/auth.js'
import { formatTelephone } from '../../../../lib/format.js'
import { estTelephoneValide } from '../../../../lib/pays.js'
import './FormulaireSms.css'

// Connexion par code SMS (fermée par défaut : VITE_AUTH_SMS). Deux temps : le numéro,
// puis le code reçu. Réservée aux comptes existants ; l'inscription se fait par e-mail.
export default function FormulaireSms() {
  const [telephone, setTelephone] = useState('')
  const [code, setCode] = useState('')
  const [codeEnvoye, setCodeEnvoye] = useState(false)
  const [erreur, setErreur] = useState(null)
  const [echec, setEchec] = useState(null)
  const [envoi, setEnvoi] = useState(false)

  async function executer(action) {
    setEnvoi(true)
    setEchec(null)
    try {
      await action()
    } catch (e) {
      setEchec(e.message)
    } finally {
      setEnvoi(false)
    }
  }

  function surEnvoiNumero(evenement) {
    evenement.preventDefault()
    if (!estTelephoneValide(telephone)) {
      setErreur('Saisissez un numéro de téléphone complet.')
      return document.getElementById('cx-telephone')?.focus()
    }
    setErreur(null)
    executer(async () => {
      await envoyerCodeSms(telephone)
      setCodeEnvoye(true)
    })
  }

  function surEnvoiCode(evenement) {
    evenement.preventDefault()
    if (!/^\d{6}$/.test(code)) {
      setErreur('Saisissez les 6 chiffres du code reçu par SMS.')
      return document.getElementById('cx-code')?.focus()
    }
    setErreur(null)
    executer(() => verifierCodeSms(telephone, code))
  }

  if (!codeEnvoye) {
    return (
      <form className="formulaire-sms" noValidate onSubmit={surEnvoiNumero}>
        {echec && (
          <Message ton="erreur" titre="Code non envoyé">
            {echec}
          </Message>
        )}
        <Field id="cx-telephone" label="Numéro de téléphone du compte" requis erreur={erreur}>
          <PhoneInput value={telephone} onChange={setTelephone} />
        </Field>
        <Button type="submit" taille="grande" chargement={envoi}>
          Recevoir un code par SMS
        </Button>
      </form>
    )
  }

  return (
    <form className="formulaire-sms" noValidate onSubmit={surEnvoiCode}>
      <Message ton="info">
        Un code à 6 chiffres a été envoyé au {formatTelephone(telephone)}.
      </Message>
      {echec && (
        <Message ton="erreur" titre="Connexion refusée">
          {echec}
        </Message>
      )}
      <Field id="cx-code" label="Code reçu par SMS" requis erreur={erreur}>
        <Input
          mono
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
        />
      </Field>
      <div className="formulaire-sms__actions">
        <Button type="submit" taille="grande" chargement={envoi}>
          Se connecter
        </Button>
        <Button variante="discret" onClick={() => setCodeEnvoye(false)}>
          Changer de numéro
        </Button>
      </div>
    </form>
  )
}
