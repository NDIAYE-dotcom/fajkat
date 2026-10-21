import Field from '../../../../components/ui/Field/Field.jsx'
import Input from '../../../../components/ui/Input/Input.jsx'
import Select from '../../../../components/ui/Select/Select.jsx'
import { GROUPES_SANGUINS } from '../../../patients/fiche.js'
import './ChampsObstetrique.css'

const chiffres = (texte) => texte.replace(/\D/g, '').slice(0, 2)

// Gestité, parité, enfants vivants, puis groupe sanguin et rhésus (fiche médicale du
// dossier, étape 11). aideGroupe : précise ce qu'une case vide veut dire.
export default function ChampsObstetrique({ idBase, saisie, maj, erreurs, aideGroupe }) {
  const nombre = (champ, label, aide) => (
    <Field id={`${idBase}-${champ}`} label={label} requis erreur={erreurs[champ]} aide={aide}>
      <Input
        mono
        inputMode="numeric"
        autoComplete="off"
        maxLength={2}
        value={saisie[champ]}
        onChange={(e) => maj(champ, chiffres(e.target.value))}
      />
    </Field>
  )
  return (
    <div className="champs-obstetrique">
      <div className="champs-obstetrique__nombres">
        {nombre('gestite', 'Gestité', 'Grossesses, celle-ci comprise.')}
        {nombre('parite', 'Parité', 'Accouchements avant celle-ci.')}
        {nombre('vivants', 'Enfants vivants', 'Aujourd’hui.')}
      </div>
      <Field id={`${idBase}-groupe`} label="Groupe sanguin et rhésus" facultatif aide={aideGroupe}>
        <Select
          placeholder="Non renseigné"
          options={GROUPES_SANGUINS}
          value={saisie.groupe}
          onChange={(e) => maj('groupe', e.target.value)}
        />
      </Field>
    </div>
  )
}
