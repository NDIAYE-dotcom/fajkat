import Checkbox from '../../../../components/ui/Checkbox/Checkbox.jsx'
import Field from '../../../../components/ui/Field/Field.jsx'
import Input from '../../../../components/ui/Input/Input.jsx'
import Radio from '../../../../components/ui/Radio/Radio.jsx'
import Select from '../../../../components/ui/Select/Select.jsx'
import Switch from '../../../../components/ui/Switch/Switch.jsx'
import Textarea from '../../../../components/ui/Textarea/Textarea.jsx'
import Demo from '../../Demo/Demo.jsx'
import SectionAtelier from '../../SectionAtelier/SectionAtelier.jsx'
import { PRISES_EN_CHARGE } from '../../donnees.js'

// Un même champ dans tous ses états, construit par « rendre(attributs) ».
function etatsChamp(label, rendre, aide) {
  return [
    {
      libelle: 'Normal',
      contenu: (
        <Field label={label} aide={aide}>
          {rendre({})}
        </Field>
      ),
    },
    {
      libelle: 'Survol',
      contenu: <Field label={label}>{rendre({ 'data-etat': 'survol' })}</Field>,
    },
    { libelle: 'Focus', contenu: <Field label={label}>{rendre({ 'data-etat': 'focus' })}</Field> },
    { libelle: 'Désactivé', contenu: <Field label={label}>{rendre({ disabled: true })}</Field> },
    {
      libelle: 'Erreur',
      contenu: (
        <Field label={label} erreur="Ce champ est obligatoire." requis>
          {rendre({})}
        </Field>
      ),
    },
  ]
}

// Cases, boutons radio, interrupteurs : mêmes états, sans Field (le libellé est sur la ligne).
function etatsChoix(rendre) {
  return [
    { libelle: 'Normal', contenu: rendre({}) },
    { libelle: 'Coché', contenu: rendre({ defaultChecked: true }) },
    { libelle: 'Survol', contenu: rendre({ 'data-etat': 'survol' }) },
    { libelle: 'Focus', contenu: rendre({ 'data-etat': 'focus' }) },
    { libelle: 'Désactivé', contenu: rendre({ disabled: true, defaultChecked: true }) },
    { libelle: 'Erreur', contenu: rendre({ invalide: true }) },
  ]
}

export default function Champs() {
  return (
    <SectionAtelier
      id="champs"
      titre="Champs de saisie"
      intro="Chaque champ a un libellé visible ; l'aide et l'erreur lui sont reliées et lues par les lecteurs d'écran. Les états survol et focus sont figés ici pour comparaison."
    >
      <Demo
        titre="Texte"
        etats={etatsChamp(
          'Quartier ou village',
          (a) => (
            <Input placeholder="Ex. Médina" {...a} />
          ),
          'Sert à distinguer les homonymes.',
        )}
      />
      <Demo
        titre="Liste déroulante"
        etats={etatsChamp('Prise en charge', (a) => (
          <Select placeholder="Choisir…" options={PRISES_EN_CHARGE} defaultValue="" {...a} />
        ))}
      />
      <Demo
        titre="Zone de texte avec compteur"
        note="Le compteur fonctionne aussi sans valeur contrôlée (defaultValue) ; il n'est annoncé aux lecteurs d'écran qu'à 20 caractères de la limite."
        etats={etatsChamp('Observations', (a) => (
          <Textarea maxLength={160} defaultValue="Patiente venue avec sa mère." rows={3} {...a} />
        ))}
      />
      <Demo
        titre="Case à cocher"
        etats={etatsChoix((a) => (
          <Checkbox label="Femme enceinte" description="Ouvre le suivi CPN" {...a} />
        ))}
      />
      <Demo
        titre="Boutons radio"
        etats={etatsChoix((a) => (
          <Radio name={`sexe-${JSON.stringify(a)}`} label="Femme" {...a} />
        ))}
      />
      <Demo
        titre="Interrupteur"
        etats={etatsChoix((a) => <Switch label="Rappels WhatsApp" {...a} />).filter(
          (e) => e.libelle !== 'Erreur',
        )}
      />
      <Demo titre="Groupe de boutons radio">
        <Field label="Sexe" groupe requis erreur="Choisissez une réponse.">
          <Radio name="sexe-groupe" value="F" label="Femme" />
          <Radio name="sexe-groupe" value="M" label="Homme" />
        </Field>
      </Demo>
    </SectionAtelier>
  )
}
