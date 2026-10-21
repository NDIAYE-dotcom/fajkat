import { useState } from 'react'
import Checkbox from '../../../../components/ui/Checkbox/Checkbox.jsx'
import Field from '../../../../components/ui/Field/Field.jsx'
import Input from '../../../../components/ui/Input/Input.jsx'
import Textarea from '../../../../components/ui/Textarea/Textarea.jsx'
import GrilleFormulaire from '../../../rendez-vous/components/GrilleFormulaire/GrilleFormulaire.jsx'
import { CERTIFICAT_MAX, VARIABLES_CERTIFICAT } from '../../documents.js'
import './FormulaireModeleCertificat.css'

const PERMISES = new Set([...VARIABLES_CERTIFICAT.map((v) => v.cle), 'date_naissance'])

// Modèle de certificat : nom, repos en jours ou non, texte avec ses variables. Aucune
// variable de diagnostic n'existe (la base refuse un modèle qui en contiendrait).
export default function FormulaireModeleCertificat({ modele, envoi, onEnregistrer, onAnnuler }) {
  const [s, setS] = useState(() => ({
    label: modele?.label ?? '',
    body: modele?.body ?? '',
    has_days: modele?.has_days ?? false,
  }))
  const [erreurs, setErreurs] = useState({})

  function envoyer(evenement) {
    evenement.preventDefault()
    const e = {}
    if (s.label.trim().length < 2) e.label = 'Donnez un nom (exemple : Certificat de repos).'
    if (s.body.trim().length < 10) e.body = 'Écrivez le texte du modèle.'
    const inconnues = [...s.body.matchAll(/\{([^{}]*)\}/g)]
      .map((m) => m[1])
      .filter((v) => !PERMISES.has(v))
    if (inconnues.length) {
      e.body = `Variable inconnue : {${inconnues[0]}}. Utilisez seulement celles de la liste.`
    }
    setErreurs(e)
    if (Object.keys(e).length) return
    onEnregistrer({ label: s.label.trim(), body: s.body.trim(), has_days: s.has_days })
  }

  return (
    <GrilleFormulaire
      onSubmit={envoyer}
      onAnnuler={onAnnuler}
      envoi={envoi}
      libelleEnvoi={modele ? 'Enregistrer' : 'Ajouter le modèle'}
    >
      <Field label="Nom du modèle" erreur={erreurs.label} requis>
        <Input
          value={s.label}
          maxLength={80}
          onChange={(e) => setS((p) => ({ ...p, label: e.target.value }))}
        />
      </Field>
      <Checkbox
        label="Certificat de repos"
        description="Le soignant indique le nombre de jours et le premier jour."
        checked={s.has_days}
        onChange={(e) => setS((p) => ({ ...p, has_days: e.target.checked }))}
      />
      <Field
        label="Texte"
        erreur={erreurs.body}
        requis
        className="formulaire-modele-certificat__texte"
      >
        <Textarea
          rows={8}
          maxLength={CERTIFICAT_MAX}
          value={s.body}
          onChange={(e) => setS((p) => ({ ...p, body: e.target.value }))}
        />
      </Field>
      <div className="formulaire-modele-certificat__variables">
        <p>Variables remplacées à l’émission (jamais de diagnostic) :</p>
        <ul>
          {VARIABLES_CERTIFICAT.map((v) => (
            <li key={v.cle}>
              <code>{`{${v.cle}}`}</code> {v.libelle}
            </li>
          ))}
        </ul>
        <p>Écrivez « …… » à l’endroit que le soignant complète à chaque fois.</p>
      </div>
    </GrilleFormulaire>
  )
}
