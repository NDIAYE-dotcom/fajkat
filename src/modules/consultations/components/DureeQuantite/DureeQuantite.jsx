import { RotateCcw } from 'lucide-react'
import { useId } from 'react'
import Button from '../../../../components/ui/Button/Button.jsx'
import Checkbox from '../../../../components/ui/Checkbox/Checkbox.jsx'
import Field from '../../../../components/ui/Field/Field.jsx'
import Icone from '../../../../components/ui/Icone/Icone.jsx'
import Input from '../../../../components/ui/Input/Input.jsx'
import { quantiteCalculee } from '../../ordonnance.js'
import './DureeQuantite.css'

// Phrase sous la quantité : d'où elle vient, ou pourquoi elle n'est pas calculée.
function indicationQuantite(l, forme) {
  if (!forme) {
    return l.quantite_manuelle
      ? 'Saisie à la main'
      : 'Choisissez la forme pour calculer la quantité'
  }
  if (!forme.counted) return `En ${forme.pack_unit_plural}, à saisir`
  return l.quantite_manuelle ? 'Modifiée à la main' : 'Calculée : prises par jour × jours'
}

// Durée, quantité totale (calculée pour une forme comptée à l'unité, modifiable) et
// « Seulement si besoin », dans une ligne d'ordonnance.
export default function DureeQuantite({
  ligne: l,
  forme,
  erreurs,
  desactive,
  onChange,
  onRecalculer,
}) {
  const id = useId()
  const calculee = quantiteCalculee(l, forme)
  return (
    <>
      <div className="duree-quantite__cases">
        <Field label="Durée" erreur={erreurs.duree}>
          <Input
            mono
            inputMode="numeric"
            value={l.saisies.duree}
            disabled={desactive}
            data-saisie="duree"
            suffixe={l.duration_days > 1 ? 'jours' : 'jour'}
            onChange={(e) => onChange({ saisies: { duree: e.target.value } })}
          />
        </Field>
        {/* Indication sous la case (et non au-dessus) : les deux titres restent alignés. */}
        <Field label="Quantité totale" erreur={erreurs.quantite}>
          <Input
            mono
            inputMode="numeric"
            value={l.saisies.quantite}
            disabled={desactive}
            data-saisie="quantite"
            suffixe={l.quantity_unit || undefined}
            aria-describedby={`${id}-quantite`}
            onChange={(e) => onChange({ saisies: { quantite: e.target.value } })}
          />
          <p id={`${id}-quantite`} className="duree-quantite__indication">
            {indicationQuantite(l, forme)}
          </p>
        </Field>
      </div>
      <div className="duree-quantite__options">
        {forme?.counted && l.quantite_manuelle && calculee !== null && (
          <Button
            variante="discret"
            iconeDebut={<Icone icone={RotateCcw} />}
            disabled={desactive}
            onClick={onRecalculer}
          >
            {`Recalculer (${calculee})`}
          </Button>
        )}
        <Checkbox
          label="Seulement si besoin"
          checked={l.as_needed}
          disabled={desactive}
          onChange={(e) => onChange({ as_needed: e.target.checked })}
        />
      </div>
    </>
  )
}
