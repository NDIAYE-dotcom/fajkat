import DateInput from '../../../../components/ui/DateInput/DateInput.jsx'
import Field from '../../../../components/ui/Field/Field.jsx'
import Input from '../../../../components/ui/Input/Input.jsx'
import Radio from '../../../../components/ui/Radio/Radio.jsx'
import Select from '../../../../components/ui/Select/Select.jsx'
import { libellePlaces } from '../../prise.js'
import { heureCourte, libelleDuree } from '../../utils.js'
import './ChampsRdv.css'

// Quand : type (prise seulement), praticien (offre Clinique), date, puis la séance du jour
// avec ses places, ou une heure libre. seances : séances de ce type ce jour-là, avec leurs
// places prises (vide pour un rendez-vous discret masqué : la base retrouve sa séance).
// types : types visibles par l'utilisateur ; null pour un report (le type ne change pas).
// Rien n'est coché d'office : « Autre heure, hors séance » est un choix volontaire.
// onSeance(s) : séance choisie (la fenêtre signale aussitôt une séance pleine).
export default function ChampsRdv({
  id,
  saisie,
  erreurs,
  maj,
  types,
  praticiens,
  seances,
  onSeance,
}) {
  const autreHeure = seances.length === 0 || (!saisie.seanceId && saisie.horsSeance)

  function changer(champ, valeur) {
    maj(champ, valeur)
    // Autre type, praticien ou jour : la séance choisie, ou le choix « hors séance », ne
    // vaut plus.
    if (saisie.seanceId) maj('seanceId', '')
    if (saisie.horsSeance) maj('horsSeance', false)
  }

  return (
    <div className="champs-rdv">
      {types && (
        <div data-champ="typeId">
          <Field label="Type de rendez-vous" requis erreur={erreurs.typeId}>
            <Select
              value={saisie.typeId}
              onChange={(e) => changer('typeId', e.target.value)}
              placeholder="Choisissez un type"
              options={types.map((t) => ({
                valeur: t.id,
                libelle: `${t.label} (${libelleDuree(t.duration_minutes)})`,
              }))}
            />
          </Field>
        </div>
      )}

      {praticiens && (
        <div data-champ="praticienId">
          <Field label="Praticien" aide="Facultatif." erreur={erreurs.praticienId}>
            <Select
              value={saisie.praticienId}
              onChange={(e) => changer('praticienId', e.target.value)}
              options={[
                { valeur: '', libelle: 'Sans praticien' },
                ...praticiens.map((p) => ({ valeur: p.id, libelle: p.nom })),
              ]}
            />
          </Field>
        </div>
      )}

      <div data-champ="date">
        <Field label="Date" requis erreur={erreurs.date}>
          <DateInput value={saisie.date} onChange={(v) => changer('date', v)} />
        </Field>
      </div>

      {seances.length > 0 && (
        <div data-champ="seanceId">
          <Field label="Séance" groupe erreur={erreurs.seanceId}>
            <div className="champs-rdv__seances">
              {seances.map((s) => (
                <Radio
                  key={s.id}
                  name={`${id}-seance`}
                  value={s.id}
                  checked={saisie.seanceId === s.id}
                  onChange={() => {
                    maj('seanceId', s.id)
                    maj('horsSeance', false)
                    maj('heure', heureCourte(s.start_time))
                    onSeance?.(s)
                  }}
                  label={
                    <span className="champs-rdv__seance">
                      <span className="champs-rdv__horaire">
                        {`${heureCourte(s.start_time)} – ${heureCourte(s.end_time)}`}
                      </span>
                      <span>
                        {libellePlaces(s.capacity == null ? null : s.capacity - s.prises)}
                      </span>
                    </span>
                  }
                />
              ))}
              <Radio
                name={`${id}-seance`}
                value=""
                checked={!saisie.seanceId && !!saisie.horsSeance}
                onChange={() => {
                  maj('seanceId', '')
                  maj('horsSeance', true)
                }}
                label="Autre heure, hors séance"
              />
            </div>
          </Field>
        </div>
      )}

      {autreHeure && (
        <div data-champ="heure">
          <Field label="Heure" requis erreur={erreurs.heure}>
            <Input
              type="time"
              value={saisie.heure}
              onChange={(e) => maj('heure', e.target.value)}
            />
          </Field>
        </div>
      )}
    </div>
  )
}
