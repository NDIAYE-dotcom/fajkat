import DateInput from '../../../../components/ui/DateInput/DateInput.jsx'
import Field from '../../../../components/ui/Field/Field.jsx'
import Input from '../../../../components/ui/Input/Input.jsx'
import PhoneInput from '../../../../components/ui/PhoneInput/PhoneInput.jsx'
import Radio from '../../../../components/ui/Radio/Radio.jsx'
import Select from '../../../../components/ui/Select/Select.jsx'
import { useSuggestionsQuartier } from '../../hooks/useSuggestionsQuartier.js'
import { SEXES, TITULAIRES } from '../../utils.js'
import SuggestionsQuartier from '../SuggestionsQuartier/SuggestionsQuartier.jsx'
import './ChampsIdentite.css'

// Champs d'identité d'un patient : nom, prénom, sexe, naissance (date exacte, âge déclaré
// en ans ou en mois ; date estimée avant 5 ans), téléphone et son titulaire, quartier
// (quartiers déjà saisis proposés pendant la frappe), mère,
// ancien n° de dossier (registre papier ou carnet), accord WhatsApp. Les ids des champs sont « {id}-{champ} » (focus sur la première erreur).
export default function ChampsIdentite({ id, saisie, erreurs, onChange }) {
  const telephoneSaisi = Boolean(saisie.telephone)
  const quartier = useSuggestionsQuartier(saisie.quartier, (v) => onChange('quartier', v))

  return (
    <>
      <div className="champs-identite__ligne">
        <Field id={`${id}-nom`} label="Nom de famille" requis erreur={erreurs.nom}>
          <Input
            autoComplete="off"
            autoCapitalize="words"
            maxLength={80}
            value={saisie.nom}
            onChange={(e) => onChange('nom', e.target.value)}
          />
        </Field>
        <Field id={`${id}-prenom`} label="Prénom" requis erreur={erreurs.prenom}>
          <Input
            autoComplete="off"
            autoCapitalize="words"
            maxLength={80}
            value={saisie.prenom}
            onChange={(e) => onChange('prenom', e.target.value)}
          />
        </Field>
      </div>

      <Field label="Sexe" groupe requis erreur={erreurs.sexe}>
        <div className="champs-identite__choix">
          {SEXES.map((s, i) => (
            <Radio
              key={s.valeur}
              id={i === 0 ? `${id}-sexe` : undefined}
              name={`${id}-sexe`}
              label={s.libelle}
              value={s.valeur}
              checked={saisie.sexe === s.valeur}
              onChange={() => onChange('sexe', s.valeur)}
            />
          ))}
        </div>
      </Field>

      <Field
        id={`${id}-naissance`}
        label="Date de naissance"
        requis
        erreur={erreurs.naissance}
        aide={
          saisie.naissance.type === 'age'
            ? 'En ans ou en mois (« 3 ans », « 8 mois »). Avant 5 ans, une date de naissance estimée est enregistrée.'
            : 'Date exacte inconnue : cochez la case et saisissez l’âge déclaré.'
        }
      >
        <DateInput
          ageDeclare
          value={saisie.naissance}
          onChange={(valeur) => onChange('naissance', valeur)}
        />
      </Field>

      <div className="champs-identite__ligne">
        <Field
          id={`${id}-telephone`}
          label="Téléphone"
          facultatif
          erreur={erreurs.telephone}
          aide="Souvent celui de la famille : précisez à qui il appartient."
        >
          <PhoneInput
            value={saisie.telephone}
            onChange={(valeur) => onChange('telephone', valeur)}
          />
        </Field>
        {telephoneSaisi && (
          <Field
            id={`${id}-titulaire`}
            label="Ce numéro appartient à"
            requis
            erreur={erreurs.titulaire}
          >
            <Select
              placeholder="Choisir"
              options={TITULAIRES}
              value={saisie.titulaire}
              onChange={(e) => onChange('titulaire', e.target.value)}
            />
          </Field>
        )}
      </div>

      <div className="champs-identite__ligne">
        <Field
          id={`${id}-quartier`}
          label="Quartier ou village"
          facultatif
          aide="Les quartiers déjà saisis sont proposés. Vous pouvez en taper un nouveau."
        >
          <Input autoComplete="off" maxLength={120} value={saisie.quartier} {...quartier.champ} />
        </Field>
        <SuggestionsQuartier {...quartier.liste} />
        <Field
          id={`${id}-mere`}
          label="Prénom de la mère"
          facultatif
          aide="Aide à distinguer les homonymes."
        >
          <Input
            autoComplete="off"
            autoCapitalize="words"
            maxLength={80}
            value={saisie.mere}
            onChange={(e) => onChange('mere', e.target.value)}
          />
        </Field>
      </div>

      <Field
        id={`${id}-ancienNumero`}
        label="Ancien n° de dossier (registre ou carnet)"
        facultatif
        aide="Le numéro de l’ancien registre papier ou du carnet de santé : il reste cherchable."
      >
        <Input
          autoComplete="off"
          mono
          maxLength={40}
          value={saisie.ancienNumero ?? ''}
          onChange={(e) => onChange('ancienNumero', e.target.value)}
        />
      </Field>

      {telephoneSaisi && (
        <Field
          label="Rappels et messages sur WhatsApp"
          groupe
          facultatif
          aide="Demandez l’accord de la personne. Il est enregistré avec la date."
        >
          <div className="champs-identite__choix">
            <Radio
              name={`${id}-consentement`}
              label="Accepte"
              checked={saisie.consentement === 'oui'}
              onChange={() => onChange('consentement', 'oui')}
            />
            <Radio
              name={`${id}-consentement`}
              label="Refuse"
              checked={saisie.consentement === 'non'}
              onChange={() => onChange('consentement', 'non')}
            />
          </div>
        </Field>
      )}
    </>
  )
}
