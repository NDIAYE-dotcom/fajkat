import DateInput from '../../../../components/ui/DateInput/DateInput.jsx'
import Field from '../../../../components/ui/Field/Field.jsx'
import Input from '../../../../components/ui/Input/Input.jsx'
import Radio from '../../../../components/ui/Radio/Radio.jsx'
import { formatDate, lireDateFr } from '../../../../lib/format.js'
import { DATATIONS, formatSA } from '../../grossesse.js'
import './ChampsDatation.css'

const date = (texte) => ({ type: 'date', date: lireDateFr(texte), texte })
const chiffres = (texte, n) => texte.replace(/\D/g, '').slice(0, n)

// Datation d'une grossesse : DDR, échographie (âge gestationnel lu ou DPA lue) ou
// estimation clinique. L'aperçu (DPA, terme du jour) suit la saisie ; la base recalcule.
// idBase : préfixe des identifiants des cases (focus sur la première erreur) ;
// termeRetenu : terme du jour d'après la datation retenue (nouvelle datation), pour afficher
// l'écart. Information seulement : aucune règle de choix, aucun seuil.
export default function ChampsDatation({
  idBase,
  saisie,
  maj,
  erreurs,
  apercu,
  termeRetenu = null,
}) {
  const s = saisie
  return (
    <div className="champs-datation">
      <Field groupe label="Comment la grossesse est-elle datée ?" requis>
        <div className="champs-datation__choix">
          {DATATIONS.map((d) => (
            <Radio
              key={d.valeur}
              name={`${idBase}-type`}
              label={d.libelle}
              checked={s.type === d.valeur}
              onChange={() => maj('type', d.valeur)}
            />
          ))}
        </div>
      </Field>

      {s.type === 'lmp' ? (
        <Field
          id={`${idBase}-ddr`}
          label="Date des dernières règles"
          requis
          erreur={erreurs.ddr}
          aide="Premier jour des dernières règles."
        >
          <DateInput value={date(s.ddr)} onChange={(d) => maj('ddr', d.texte)} />
        </Field>
      ) : (
        <>
          <Field
            id={`${idBase}-examen`}
            label={s.type === 'ultrasound' ? 'Date de l’échographie' : 'Date de l’estimation'}
            requis
            erreur={erreurs.examen}
          >
            <DateInput value={date(s.examen)} onChange={(d) => maj('examen', d.texte)} />
          </Field>
          {s.type === 'ultrasound' && (
            <Field groupe label="Lu sur le compte rendu">
              <div className="champs-datation__choix">
                <Radio
                  name={`${idBase}-lecture`}
                  label="L’âge gestationnel"
                  checked={s.lecture === 'age'}
                  onChange={() => maj('lecture', 'age')}
                />
                <Radio
                  name={`${idBase}-lecture`}
                  label="La date prévue d’accouchement"
                  checked={s.lecture === 'dpa'}
                  onChange={() => maj('lecture', 'dpa')}
                />
              </div>
            </Field>
          )}
          {s.type === 'ultrasound' && s.lecture === 'dpa' ? (
            <Field
              id={`${idBase}-dpa`}
              label="Date prévue d’accouchement lue"
              requis
              erreur={erreurs.dpa}
            >
              <DateInput value={date(s.dpa)} onChange={(d) => maj('dpa', d.texte)} />
            </Field>
          ) : (
            <Field
              id={`${idBase}-semaines`}
              label="Âge gestationnel à l’examen"
              requis
              erreur={erreurs.semaines}
              aide="En semaines d’aménorrhée (SA) et jours."
            >
              <div className="champs-datation__age">
                <Input
                  mono
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={2}
                  suffixe="SA"
                  value={s.semaines}
                  onChange={(e) => maj('semaines', chiffres(e.target.value, 2))}
                />
                <Input
                  id={`${idBase}-jours`}
                  mono
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={1}
                  suffixe="j"
                  aria-label="Jours en plus des semaines"
                  value={s.jours}
                  onChange={(e) => maj('jours', chiffres(e.target.value, 1))}
                />
              </div>
            </Field>
          )}
        </>
      )}

      {apercu && (
        <p className="champs-datation__apercu" role="status">
          <span>
            Date prévue d’accouchement{' '}
            <span className="champs-datation__chiffres">{formatDate(apercu.dpa)}</span>
          </span>
          {apercu.ageJours >= 0 && (
            <span>
              Terme aujourd’hui{' '}
              <span className="champs-datation__chiffres">{formatSA(apercu.ageJours)}</span>
            </span>
          )}
          {termeRetenu !== null && apercu.ageJours >= 0 && (
            <span>
              Écart avec la datation retenue :{' '}
              <span className="champs-datation__chiffres">
                {formatSA(Math.abs(apercu.ageJours - termeRetenu))}
              </span>
            </span>
          )}
        </p>
      )}
    </div>
  )
}
