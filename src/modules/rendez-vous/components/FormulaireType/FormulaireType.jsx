import { useState } from 'react'
import Checkbox from '../../../../components/ui/Checkbox/Checkbox.jsx'
import Field from '../../../../components/ui/Field/Field.jsx'
import Input from '../../../../components/ui/Input/Input.jsx'
import Select from '../../../../components/ui/Select/Select.jsx'
import { lireEntier } from '../../utils.js'
import GrilleFormulaire from '../GrilleFormulaire/GrilleFormulaire.jsx'

// Même liste que appointment_label_is_discreet() en base : un filet de sécurité, la case
// « Type discret » reste le vrai réglage.
const MOTS_DISCRETS =
  /(d[eéEÉ]pistage|planification|contracep|\bpf\b|\bvih\b|\bptme\b|\bist\b|\bsida\b|sant[eéEÉ] mentale|\bpsy|avortement|\bsaa\b|\bvbg\b|violence)/i

function versSaisie(t) {
  return {
    label: t?.label ?? '',
    duree: t?.duration_minutes != null ? String(t.duration_minutes) : '15',
    discret: t?.is_discreet ?? false,
    recurrence: t?.recurrence_months != null ? String(t.recurrence_months) : '',
    service: t?.queue_service_id ?? '',
    nommer: t?.name_in_reminder ?? false,
  }
}

// Type de rendez-vous : libellé, durée, discrétion, récurrence proposée, file à l'arrivée,
// nom du type dans le rappel (jamais pour un type discret : la base le refuse aussi).
// type : null pour un nouveau type. services : services de la file (vide sans file).
export default function FormulaireType({ type, services, envoi, onEnregistrer, onAnnuler }) {
  const [s, setS] = useState(() => versSaisie(type))
  const [erreurs, setErreurs] = useState({})
  const maj = (champ) => (e) => setS((p) => ({ ...p, [champ]: e.target.value }))
  // Nouveau type : la base le rend discret d'office si le libellé évoque la PF, un
  // dépistage, le VIH… ; on l'annonce dès la saisie.
  const discretPropose = !type && MOTS_DISCRETS.test(s.label)
  const discret = s.discret || discretPropose

  function envoyer(evenement) {
    evenement.preventDefault()
    const duree = lireEntier(s.duree)
    const recurrence = lireEntier(s.recurrence)
    const e = {}
    if (s.label.trim().length < 2) e.label = 'Donnez un nom (exemple : Vaccination).'
    if (duree == null || Number.isNaN(duree) || duree < 5 || duree > 480) {
      e.duree = 'Tapez une durée en minutes, de 5 à 480.'
    }
    if (Number.isNaN(recurrence) || (recurrence != null && (recurrence < 1 || recurrence > 24))) {
      e.recurrence = 'Tapez un nombre de mois, de 1 à 24, ou laissez vide.'
    }
    setErreurs(e)
    if (Object.keys(e).length) return
    onEnregistrer({
      label: s.label.trim(),
      duration_minutes: duree,
      is_discreet: discret,
      recurrence_months: recurrence,
      queue_service_id: s.service || null,
      name_in_reminder: s.nommer && !discret,
    })
  }

  return (
    <GrilleFormulaire
      onSubmit={envoyer}
      onAnnuler={onAnnuler}
      envoi={envoi}
      libelleEnvoi={type ? 'Enregistrer' : 'Ajouter le type'}
    >
      <Field label="Nom du type" erreur={erreurs.label} requis>
        <Input value={s.label} maxLength={60} onChange={maj('label')} />
      </Field>
      <Field label="Durée" erreur={erreurs.duree} requis>
        <Input inputMode="numeric" suffixe="min" value={s.duree} onChange={maj('duree')} />
      </Field>
      <Field
        label="Récurrence proposée"
        aide="Exemple : 3 pour la planification familiale."
        erreur={erreurs.recurrence}
        facultatif
      >
        <Input
          inputMode="numeric"
          suffixe="mois"
          value={s.recurrence}
          onChange={maj('recurrence')}
        />
      </Field>
      {services.length > 0 && (
        <Field label="File d’attente à l’arrivée" aide="Bouton « Arrivé » de l’agenda.">
          <Select
            value={s.service}
            onChange={maj('service')}
            options={[
              { valeur: '', libelle: 'À choisir à l’arrivée' },
              ...services.map((q) => ({ valeur: q.id, libelle: `${q.letter} — ${q.label}` })),
            ]}
          />
        </Field>
      )}
      <div className="grille-formulaire__large">
        <Checkbox
          label="Type discret"
          description={
            discretPropose
              ? 'Coché d’office pour ce nom : il ne sera jamais écrit dans un message ou un document remis au patient.'
              : 'Jamais écrit dans un message ou un document remis au patient, qui lira seulement « votre rendez-vous ». Le téléphone est souvent partagé par la famille.'
          }
          checked={discret}
          disabled={discretPropose}
          onChange={(e) =>
            // Un type discret n'est jamais nommé dans le rappel : la case se décoche.
            setS((p) => ({
              ...p,
              discret: e.target.checked,
              nommer: e.target.checked ? false : p.nommer,
            }))
          }
        />
      </div>
      <div className="grille-formulaire__large">
        <Checkbox
          label="Nommer le type dans le rappel"
          description={
            discret
              ? 'Impossible pour un type discret.'
              : `Le rappel envoyé au patient dira « un rendez-vous au poste de santé (${s.label.trim() || 'nom du type'}) ». Sans cette case, il ne dit jamais le type.`
          }
          checked={s.nommer && !discret}
          disabled={discret}
          onChange={(e) => setS((p) => ({ ...p, nommer: e.target.checked }))}
        />
      </div>
    </GrilleFormulaire>
  )
}
