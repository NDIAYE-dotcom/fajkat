import { useState } from 'react'
import Field from '../../../../components/ui/Field/Field.jsx'
import Input from '../../../../components/ui/Input/Input.jsx'
import Select from '../../../../components/ui/Select/Select.jsx'
import { heureCourte, JOURS_SEMAINE, lireEntier } from '../../utils.js'
import GrilleFormulaire from '../GrilleFormulaire/GrilleFormulaire.jsx'

const HEURE = /^([01]\d|2[0-3]):[0-5]\d$/

function versSaisie(s) {
  return {
    // Jamais pré-rempli : un type choisi par défaut se valide sans le voir.
    type: s?.appointment_type_id ?? '',
    jour: String(s?.weekday ?? 1),
    debut: heureCourte(s?.start_time) || '08:00',
    fin: heureCourte(s?.end_time) || '12:00',
    capacite: s?.capacity != null ? String(s.capacity) : '',
    praticien: s?.practitioner_membership_id ?? '',
    label: s?.label ?? '',
  }
}

// Séance : un type, un jour de la semaine, une plage horaire et une capacité
// (exemple : vaccination le mardi de 08:00 à 12:00, 40 enfants). Praticien : offre Clinique.
export default function FormulaireSeance({
  seance,
  types,
  praticiens,
  envoi,
  onEnregistrer,
  onAnnuler,
}) {
  const [s, setS] = useState(() => versSaisie(seance))
  const [erreurs, setErreurs] = useState({})
  const maj = (champ) => (e) => setS((p) => ({ ...p, [champ]: e.target.value }))

  function envoyer(evenement) {
    evenement.preventDefault()
    const capacite = lireEntier(s.capacite)
    const e = {}
    if (!s.type) e.type = 'Choisissez le type de rendez-vous.'
    if (!HEURE.test(s.debut)) e.debut = 'Tapez une heure, par exemple 08:00.'
    if (!HEURE.test(s.fin)) e.fin = 'Tapez une heure, par exemple 12:00.'
    else if (HEURE.test(s.debut) && s.fin <= s.debut) e.fin = 'La fin doit suivre le début.'
    if (Number.isNaN(capacite) || (capacite != null && (capacite < 1 || capacite > 1000))) {
      e.capacite = 'Tapez un nombre de 1 à 1 000, ou laissez vide (sans limite).'
    }
    if (s.label.trim().length === 1) e.label = 'Au moins 2 caractères, ou laissez vide.'
    setErreurs(e)
    if (Object.keys(e).length) return
    onEnregistrer({
      appointment_type_id: s.type,
      weekday: Number(s.jour),
      start_time: s.debut,
      end_time: s.fin,
      capacity: capacite,
      practitioner_membership_id: s.praticien || null,
      label: s.label.trim() || null,
    })
  }

  return (
    <GrilleFormulaire
      onSubmit={envoyer}
      onAnnuler={onAnnuler}
      envoi={envoi}
      libelleEnvoi={seance ? 'Enregistrer' : 'Ajouter la séance'}
    >
      <Field label="Type de rendez-vous" erreur={erreurs.type} requis>
        <Select
          value={s.type}
          onChange={maj('type')}
          placeholder="Choisissez un type"
          required
          options={types.map((t) => ({ valeur: t.id, libelle: t.label }))}
        />
      </Field>
      <Field label="Jour">
        <Select
          value={s.jour}
          onChange={maj('jour')}
          options={JOURS_SEMAINE.map((j) => ({ valeur: String(j.valeur), libelle: j.libelle }))}
        />
      </Field>
      <Field label="Début" erreur={erreurs.debut} requis>
        <Input type="time" value={s.debut} onChange={maj('debut')} />
      </Field>
      <Field label="Fin" erreur={erreurs.fin} requis>
        <Input type="time" value={s.fin} onChange={maj('fin')} />
      </Field>
      <Field
        label="Capacité"
        aide="Nombre de rendez-vous au plus. Vide : sans limite."
        erreur={erreurs.capacite}
        facultatif
      >
        <Input inputMode="numeric" suffixe="places" value={s.capacite} onChange={maj('capacite')} />
      </Field>
      {praticiens && (
        <Field label="Praticien" aide="Vide : la séance est ouverte à tous.">
          <Select
            value={s.praticien}
            onChange={maj('praticien')}
            options={[
              { valeur: '', libelle: 'Tout praticien' },
              ...praticiens.map((p) => ({ valeur: p.id, libelle: p.nom })),
            ]}
          />
        </Field>
      )}
      <Field
        label="Nom de la séance"
        aide="Exemple : Séance du mardi."
        erreur={erreurs.label}
        facultatif
      >
        <Input value={s.label} maxLength={60} onChange={maj('label')} />
      </Field>
    </GrilleFormulaire>
  )
}
