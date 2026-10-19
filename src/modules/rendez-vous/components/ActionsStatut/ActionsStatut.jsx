import { CalendarCheck, CalendarX, LogIn, RotateCcw, UserX } from 'lucide-react'
import Button from '../../../../components/ui/Button/Button.jsx'
import Icone from '../../../../components/ui/Icone/Icone.jsx'
import './ActionsStatut.css'

// Boutons de statut d'un rendez-vous (fenêtre « Rendez-vous » de l'agenda). actions :
// actionsStatut() (suivi.js). Confirmer, Absent et « Remettre à prévu » s'enregistrent
// d'un clic (enCours : statut en cours d'envoi) ; Arrivé et Annuler ouvrent leur fenêtre.
export default function ActionsStatut({
  actions,
  enCours,
  desactive,
  onStatut,
  onArrivee,
  onAnnuler,
}) {
  const boutons = [
    actions.arrive && {
      cle: 'arrive',
      libelle: 'Arrivé',
      icone: LogIn,
      variante: 'primaire',
      clic: onArrivee,
    },
    actions.confirmer && {
      cle: 'confirmed',
      libelle: 'Confirmer',
      icone: CalendarCheck,
      clic: () => onStatut('confirmed'),
    },
    actions.absent && {
      cle: 'no_show',
      libelle: 'Absent',
      icone: UserX,
      clic: () => onStatut('no_show'),
    },
    actions.remettre && {
      cle: 'scheduled',
      libelle: 'Remettre à « prévu »',
      icone: RotateCcw,
      clic: () => onStatut('scheduled'),
    },
    actions.annuler && {
      cle: 'cancelled',
      libelle: 'Annuler le rendez-vous',
      icone: CalendarX,
      clic: onAnnuler,
    },
  ].filter(Boolean)

  if (boutons.length === 0) return null
  return (
    <section className="actions-statut" aria-label="Statut du rendez-vous">
      <h3 className="actions-statut__titre">Statut</h3>
      <div className="actions-statut__boutons">
        {boutons.map((b) => (
          <Button
            key={b.cle}
            variante={b.variante ?? 'secondaire'}
            iconeDebut={<Icone icone={b.icone} />}
            chargement={enCours === b.cle}
            disabled={desactive || (Boolean(enCours) && enCours !== b.cle)}
            onClick={b.clic}
          >
            {b.libelle}
          </Button>
        ))}
      </div>
    </section>
  )
}
