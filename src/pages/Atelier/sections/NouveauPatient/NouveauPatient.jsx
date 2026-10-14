import { useRef, useState } from 'react'
import Button from '../../../../components/ui/Button/Button.jsx'
import DateInput from '../../../../components/ui/DateInput/DateInput.jsx'
import Field from '../../../../components/ui/Field/Field.jsx'
import Input from '../../../../components/ui/Input/Input.jsx'
import MoneyInput from '../../../../components/ui/MoneyInput/MoneyInput.jsx'
import PhoneInput from '../../../../components/ui/PhoneInput/PhoneInput.jsx'
import Radio from '../../../../components/ui/Radio/Radio.jsx'
import Select from '../../../../components/ui/Select/Select.jsx'
import Switch from '../../../../components/ui/Switch/Switch.jsx'
import Textarea from '../../../../components/ui/Textarea/Textarea.jsx'
import { useBrouillon } from '../../../../hooks/useBrouillon.js'
import { useToast } from '../../../../hooks/useToast.js'
import { formatHeure } from '../../../../lib/format.js'
import SectionAtelier from '../../SectionAtelier/SectionAtelier.jsx'
import { LANGUES, PRISES_EN_CHARGE, PROPRIETAIRES_NUMERO } from '../../donnees.js'
import { ORDRE_CHAMPS, PATIENT_VIDE, validerPatient } from './validation.js'
import './NouveauPatient.css'

// Le focus va sur le premier champ en erreur (pour « sexe » : le premier bouton radio).
function focaliser(champ) {
  document.getElementById(champ === 'sexe' ? 'np-sexe-F' : `np-${champ}`)?.focus()
}

export default function NouveauPatient() {
  const toast = useToast()
  const brouillon = useBrouillon('atelier-nouveau-patient', PATIENT_VIDE)
  const patient = brouillon.valeur
  const [erreurs, setErreurs] = useState({})
  const [envoi, setEnvoi] = useState(false)
  const [coupure, setCoupure] = useState(false)
  const formulaire = useRef(null)

  const maj = (champ) => (valeur) => {
    brouillon.setValeur((p) => ({ ...p, [champ]: valeur }))
    // L'erreur disparaît dès que le champ est modifié
    if (erreurs[champ]) {
      setErreurs((precedentes) => {
        const suite = { ...precedentes }
        delete suite[champ]
        return suite
      })
    }
  }
  const texte = (champ) => (evenement) => maj(champ)(evenement.target.value)

  // Enregistrement simulé : 1,2 s de réseau ; « coupure » simule une connexion perdue.
  async function enregistrer() {
    setEnvoi(true)
    await new Promise((resoudre) => setTimeout(resoudre, 1200))
    setEnvoi(false)
    if (coupure) {
      toast.erreur("Le patient n'a pas été enregistré", {
        message: 'Connexion perdue. Votre saisie est conservée sur cet appareil.',
        // Réessayer renvoie le formulaire tel qu'il est à l'écran (état à jour, revalidé).
        action: { libelle: 'Réessayer', onClick: () => formulaire.current?.requestSubmit() },
      })
      return
    }
    toast.succes(`${patient.prenom} ${patient.nom} est enregistré(e)`, {
      message: 'Dossier PS-2026-0143 créé.',
    })
    brouillon.effacer()
  }

  function surEnvoi(evenement) {
    evenement.preventDefault()
    const trouvees = validerPatient(patient)
    setErreurs(trouvees)
    const premiere = ORDRE_CHAMPS.find((champ) => trouvees[champ])
    if (premiere) focaliser(premiere)
    else enregistrer()
  }

  const nombreErreurs = Object.keys(erreurs).length

  return (
    <SectionAtelier
      id="nouveau-patient"
      titre="Formulaire « Nouveau patient »"
      intro="Assemblage complet : brouillon enregistré sur l'appareil à chaque frappe, erreurs au moment de l'envoi, focus sur la première erreur, saisie jamais perdue."
    >
      <form ref={formulaire} className="nouveau-patient" noValidate onSubmit={surEnvoi}>
        {brouillon.restaure && brouillon.enregistreLe && (
          <p className="nouveau-patient__brouillon">
            Votre saisie précédente a été retrouvée.{' '}
            <Button variante="discret" onClick={brouillon.effacer}>
              Repartir d'un formulaire vide
            </Button>
          </p>
        )}

        <p className="nouveau-patient__resume" role="alert">
          {nombreErreurs > 0 &&
            `${nombreErreurs} champ${nombreErreurs > 1 ? 's' : ''} à corriger avant d'enregistrer.`}
        </p>

        <fieldset className="nouveau-patient__groupe">
          <legend className="nouveau-patient__legende">Identité</legend>
          <div className="nouveau-patient__grille">
            <Field id="np-prenom" label="Prénom" requis erreur={erreurs.prenom}>
              <Input autoComplete="off" value={patient.prenom} onChange={texte('prenom')} />
            </Field>
            <Field id="np-nom" label="Nom de famille" requis erreur={erreurs.nom}>
              <Input autoComplete="off" value={patient.nom} onChange={texte('nom')} />
            </Field>
            <Field label="Sexe" groupe requis erreur={erreurs.sexe}>
              <div className="nouveau-patient__ligne">
                {[
                  ['F', 'Femme'],
                  ['M', 'Homme'],
                ].map(([valeur, libelle]) => (
                  <Radio
                    key={valeur}
                    id={`np-sexe-${valeur}`}
                    name="np-sexe"
                    value={valeur}
                    label={libelle}
                    checked={patient.sexe === valeur}
                    onChange={() => maj('sexe')(valeur)}
                  />
                ))}
              </div>
            </Field>
            <Field id="np-naissance" label="Date de naissance" requis erreur={erreurs.naissance}>
              <DateInput ageDeclare value={patient.naissance} onChange={maj('naissance')} />
            </Field>
            <Field
              id="np-prenomMere"
              label="Prénom de la mère"
              facultatif
              aide="Aide à distinguer les homonymes (Diop, Ndiaye, Fall…)."
            >
              <Input autoComplete="off" value={patient.prenomMere} onChange={texte('prenomMere')} />
            </Field>
          </div>
        </fieldset>

        <fieldset className="nouveau-patient__groupe">
          <legend className="nouveau-patient__legende">Contact</legend>
          <div className="nouveau-patient__grille">
            <Field id="np-telephone" label="Téléphone" facultatif erreur={erreurs.telephone}>
              <PhoneInput value={patient.telephone} onChange={maj('telephone')} />
            </Field>
            <Field
              id="np-proprietaire"
              label="À qui appartient ce numéro ?"
              aide="Un même numéro sert souvent à toute la famille."
            >
              <Select
                options={PROPRIETAIRES_NUMERO}
                value={patient.proprietaire}
                onChange={texte('proprietaire')}
              />
            </Field>
            <Field id="np-quartier" label="Quartier ou village" facultatif>
              <Input value={patient.quartier} onChange={texte('quartier')} />
            </Field>
            <Field id="np-langue" label="Langue des messages">
              <Select options={LANGUES} value={patient.langue} onChange={texte('langue')} />
            </Field>
          </div>
          <Switch
            label="Rappels WhatsApp"
            description="Vaccins, rendez-vous et résultats, la veille."
            checked={patient.rappels}
            onChange={(evenement) => maj('rappels')(evenement.target.checked)}
          />
        </fieldset>

        <fieldset className="nouveau-patient__groupe">
          <legend className="nouveau-patient__legende">Prise en charge</legend>
          <div className="nouveau-patient__grille">
            <Field id="np-priseEnCharge" label="Tiers payant">
              <Select
                options={PRISES_EN_CHARGE}
                value={patient.priseEnCharge}
                onChange={texte('priseEnCharge')}
              />
            </Field>
            <Field
              id="np-numeroAdherent"
              label="Numéro d'adhérent"
              requis={patient.priseEnCharge !== 'aucune'}
              erreur={erreurs.numeroAdherent}
            >
              <Input
                mono
                disabled={patient.priseEnCharge === 'aucune'}
                value={patient.numeroAdherent}
                onChange={texte('numeroAdherent')}
              />
            </Field>
            <Field id="np-avance" label="Avance versée" facultatif>
              <MoneyInput value={patient.avance} onChange={maj('avance')} />
            </Field>
          </div>
          <Field id="np-observations" label="Observations" facultatif>
            <Textarea
              maxLength={500}
              rows={3}
              value={patient.observations}
              onChange={texte('observations')}
            />
          </Field>
        </fieldset>

        <div className="nouveau-patient__pied">
          <Switch
            label="Simuler une coupure réseau"
            description="Pour vérifier le message d'erreur et la conservation de la saisie."
            checked={coupure}
            onChange={(evenement) => setCoupure(evenement.target.checked)}
          />
          <p className="nouveau-patient__etat-brouillon">
            {brouillon.enregistreLe
              ? `Brouillon enregistré sur cet appareil à ${formatHeure(brouillon.enregistreLe)}.`
              : 'Aucun brouillon en cours.'}
          </p>
          <div className="nouveau-patient__actions">
            <Button variante="secondaire" onClick={brouillon.effacer} disabled={envoi}>
              Effacer le formulaire
            </Button>
            <Button type="submit" chargement={envoi}>
              {envoi ? 'Enregistrement…' : 'Enregistrer le patient'}
            </Button>
          </div>
        </div>
      </form>
    </SectionAtelier>
  )
}
