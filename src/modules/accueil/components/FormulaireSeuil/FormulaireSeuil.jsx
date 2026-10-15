import { useState } from 'react'
import Button from '../../../../components/ui/Button/Button.jsx'
import Field from '../../../../components/ui/Field/Field.jsx'
import Input from '../../../../components/ui/Input/Input.jsx'
import Select from '../../../../components/ui/Select/Select.jsx'
import { lireNombre, MESURES } from '../../constantes.js'
import './FormulaireSeuil.css'

const SENS = [
  { valeur: 'at_or_above', libelle: 'à partir de (≥)' },
  { valeur: 'below', libelle: 'sous (<)' },
]
const NIVEAUX = [
  { valeur: 'alert', libelle: 'Alerte (tampon rouge)' },
  { valeur: 'warning', libelle: 'À surveiller' },
]

function versSaisie(s) {
  return {
    measure: s?.measure ?? MESURES[0].cle,
    sens: s?.below != null ? 'below' : 'at_or_above',
    valeur: String(s?.below ?? s?.at_or_above ?? '').replace('.', ','),
    level: s?.level ?? 'alert',
    label: s?.label ?? '',
    min: s?.min_age_months ?? '',
    max: s?.max_age_months ?? '',
  }
}

// Saisie d'un seuil : « Tension très élevée : systolique à partir de 180 mmHg, dès
// 180 mois ». Âges en mois (vides : sans limite). seuil : null pour un nouveau seuil.
export default function FormulaireSeuil({ seuil, envoi, onEnregistrer, onAnnuler }) {
  const [s, setS] = useState(() => versSaisie(seuil))
  const [erreur, setErreur] = useState(null)
  const unite = MESURES.find((m) => m.cle === s.measure)?.unite
  const maj = (champ) => (e) => setS((p) => ({ ...p, [champ]: e.target.value }))

  function envoyer(evenement) {
    evenement.preventDefault()
    const valeur = lireNombre(s.valeur)
    const min = lireNombre(s.min)
    const max = lireNombre(s.max)
    if (valeur == null || Number.isNaN(valeur)) return setErreur('Indiquez la valeur du seuil.')
    if (s.label.trim().length < 2) return setErreur('Donnez un libellé (exemple : Fièvre).')
    if (Number.isNaN(min) || Number.isNaN(max) || (min != null && max != null && max <= min)) {
      return setErreur('Âges en mois : le maximum doit dépasser le minimum.')
    }
    setErreur(null)
    return onEnregistrer({
      ...(seuil ? {} : { measure: s.measure }),
      below: s.sens === 'below' ? valeur : null,
      at_or_above: s.sens === 'at_or_above' ? valeur : null,
      level: s.level,
      label: s.label.trim(),
      min_age_months: min,
      max_age_months: max,
    })
  }

  return (
    <form className="formulaire-seuil" onSubmit={envoyer}>
      {!seuil && (
        <Field label="Mesure">
          <Select
            value={s.measure}
            onChange={maj('measure')}
            options={MESURES.map((m) => ({ valeur: m.cle, libelle: m.libelle }))}
          />
        </Field>
      )}
      <Field label="Libellé affiché">
        <Input value={s.label} maxLength={80} onChange={maj('label')} />
      </Field>
      <Field label="Condition">
        <Select value={s.sens} onChange={maj('sens')} options={SENS} />
      </Field>
      <Field label="Valeur">
        <Input inputMode="decimal" suffixe={unite} value={s.valeur} onChange={maj('valeur')} />
      </Field>
      <Field label="Niveau">
        <Select value={s.level} onChange={maj('level')} options={NIVEAUX} />
      </Field>
      <Field label="Âge minimum (mois)" aide="Vide : dès la naissance.">
        <Input inputMode="numeric" value={s.min} onChange={maj('min')} />
      </Field>
      <Field label="Âge maximum (mois, exclu)" aide="Vide : sans limite.">
        <Input inputMode="numeric" value={s.max} onChange={maj('max')} />
      </Field>
      {erreur && (
        <p className="formulaire-seuil__erreur" role="alert">
          {erreur}
        </p>
      )}
      <div className="formulaire-seuil__boutons">
        {onAnnuler && (
          <Button variante="discret" onClick={onAnnuler}>
            Annuler
          </Button>
        )}
        <Button type="submit" chargement={envoi}>
          {seuil ? 'Enregistrer' : 'Ajouter le seuil'}
        </Button>
      </div>
    </form>
  )
}
