import { ChevronLeft, ChevronRight } from 'lucide-react'
import BoutonIcone from '../../../../components/ui/BoutonIcone/BoutonIcone.jsx'
import Button from '../../../../components/ui/Button/Button.jsx'
import Checkbox from '../../../../components/ui/Checkbox/Checkbox.jsx'
import Field from '../../../../components/ui/Field/Field.jsx'
import Input from '../../../../components/ui/Input/Input.jsx'
import { dateValide, decaler, titrePeriode, VUES } from '../../agenda.js'
import './BarreAgenda.css'

const PAS = {
  jour: { precedent: 'Jour précédent', suivant: 'Jour suivant' },
  semaine: { precedent: 'Semaine précédente', suivant: 'Semaine suivante' },
  liste: { precedent: 'Deux semaines précédentes', suivant: 'Deux semaines suivantes' },
}

// Barre de l'agenda : vue (jour / semaine / liste), période précédente ou suivante,
// retour à aujourd'hui, saut à une date, annulés et reportés affichés ou non.
export default function BarreAgenda({
  vue,
  date,
  aujourdhui,
  afficherClos,
  onVue,
  onDate,
  onAfficherClos,
}) {
  const pas = PAS[vue] ?? PAS.jour
  return (
    <div className="barre-agenda">
      <div className="barre-agenda__vues" role="group" aria-label="Vue de l’agenda">
        {VUES.map((v) => (
          <button
            key={v.id}
            type="button"
            className="barre-agenda__vue"
            aria-pressed={vue === v.id}
            onClick={() => onVue(v.id)}
          >
            {v.libelle}
          </button>
        ))}
      </div>

      <div className="barre-agenda__periode">
        <BoutonIcone
          icone={ChevronLeft}
          label={pas.precedent}
          onClick={() => onDate(decaler(vue, date, -1))}
        />
        <h2 className="barre-agenda__titre" aria-live="polite">
          {titrePeriode(vue, date)}
        </h2>
        <BoutonIcone
          icone={ChevronRight}
          label={pas.suivant}
          onClick={() => onDate(decaler(vue, date, 1))}
        />
        {/* Déjà sur aujourd'hui : une mention, pas un bouton grisé qui semblerait bloqué. */}
        {date === aujourdhui ? (
          <span className="barre-agenda__aujourdhui">Aujourd’hui affiché</span>
        ) : (
          <Button variante="secondaire" onClick={() => onDate(aujourdhui)}>
            Revenir à aujourd’hui
          </Button>
        )}
      </div>

      <div className="barre-agenda__options">
        <Field label="Aller au" className="barre-agenda__saut">
          <Input
            type="date"
            value={date}
            onChange={(e) => dateValide(e.target.value) && onDate(e.target.value)}
          />
        </Field>
        <Checkbox
          label="Annulés et reportés"
          checked={afficherClos}
          onChange={(e) => onAfficherClos(e.target.checked)}
        />
      </div>
    </div>
  )
}
