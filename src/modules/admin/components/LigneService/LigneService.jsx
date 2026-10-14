import { Trash2 } from 'lucide-react'
import Button from '../../../../components/ui/Button/Button.jsx'
import Checkbox from '../../../../components/ui/Checkbox/Checkbox.jsx'
import Field from '../../../../components/ui/Field/Field.jsx'
import Icone from '../../../../components/ui/Icone/Icone.jsx'
import MoneyInput from '../../../../components/ui/MoneyInput/MoneyInput.jsx'
import './LigneService.css'

// Un service : proposé ou non, et son tarif en FCFA (vide tant qu'il n'est pas saisi).
// Un service ajouté à la main (sans modèle) peut être retiré.
export default function LigneService({ ligne, onChange, onRetirer }) {
  return (
    <li className={`ligne-service${ligne.propose ? '' : ' ligne-service--inactif'}`}>
      <div className="ligne-service__choix">
        <Checkbox
          label={ligne.label}
          checked={ligne.propose}
          onChange={(e) => onChange('propose', e.target.checked)}
        />
        {!ligne.template_code && (
          <Button
            variante="discret"
            iconeDebut={<Icone icone={Trash2} />}
            onClick={onRetirer}
            aria-label={`Retirer ${ligne.label}`}
          >
            Retirer
          </Button>
        )}
      </div>
      <Field
        id={`service-${ligne.id}-prix`}
        className="ligne-service__prix"
        label={
          <>
            Tarif<span className="sr-only"> : {ligne.label}</span>
          </>
        }
      >
        <MoneyInput
          value={ligne.price}
          placeholder="À saisir"
          disabled={!ligne.propose}
          onChange={(valeur) => onChange('price', valeur)}
        />
      </Field>
    </li>
  )
}
