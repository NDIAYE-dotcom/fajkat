import { useId, useRef, useState } from 'react'
import Button from '../../../../components/ui/Button/Button.jsx'
import Checkbox from '../../../../components/ui/Checkbox/Checkbox.jsx'
import Field from '../../../../components/ui/Field/Field.jsx'
import Input from '../../../../components/ui/Input/Input.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import Select from '../../../../components/ui/Select/Select.jsx'
import Textarea from '../../../../components/ui/Textarea/Textarea.jsx'
import { useEnLigne } from '../../../../hooks/useEnLigne.js'
import {
  ANTECEDENT_VIDE,
  CATEGORIES,
  DETAILS_MAX,
  EXEMPLES,
  LIBELLE_MAX,
  verifierAntecedent,
} from '../../dossier.js'
import './FormulaireAntecedent.css'

// Ajout rapide ou modification d'un antécédent, sans quitter l'écran. Après un ajout, la
// catégorie reste choisie et la case se vide : on enchaîne les antécédents. Un antécédent
// sensible le reste (la base refuse le contraire). Pas de copie sur l'appareil : les
// données médicales ne doivent pas y rester ; en cas d'échec, la saisie reste à l'écran.
// habilite : peut marquer un antécédent sensible.
export default function FormulaireAntecedent({
  initial = ANTECEDENT_VIDE,
  sensibleParDefaut = false,
  habilite,
  onEnregistrer,
  onFermer,
}) {
  const id = useId()
  const enLigne = useEnLigne()
  const modification = Boolean(initial.id)
  const [saisie, setSaisie] = useState(() =>
    modification ? initial : { ...initial, is_sensitive: sensibleParDefaut },
  )
  const [erreurs, setErreurs] = useState({})
  const [echec, setEchec] = useState(null)
  const [envoi, setEnvoi] = useState(false)
  const [ajoutes, setAjoutes] = useState(0)
  const caseLibelle = useRef(null)
  const dejaSensible = modification && initial.is_sensitive

  const maj = (champ, valeur) => {
    setSaisie((s) => ({ ...s, [champ]: valeur }))
    setErreurs((e) => ({ ...e, [champ]: undefined }))
  }

  async function envoyer(e) {
    e.preventDefault()
    const { erreurs: trouvees, valeur } = verifierAntecedent(saisie)
    setErreurs(trouvees)
    if (Object.keys(trouvees).length) return
    setEnvoi(true)
    setEchec(null)
    try {
      await onEnregistrer(valeur)
      if (modification) {
        onFermer()
        return
      }
      setAjoutes((n) => n + 1)
      setSaisie((s) => ({ ...ANTECEDENT_VIDE, category: s.category, is_sensitive: s.is_sensitive }))
      caseLibelle.current?.focus()
    } catch (err) {
      setEchec(err.message)
    } finally {
      setEnvoi(false)
    }
  }

  return (
    <form className="formulaire-antecedent" noValidate onSubmit={envoyer}>
      <p className="formulaire-antecedent__titre">
        {modification ? 'Modifier l’antécédent' : 'Nouvel antécédent'}
      </p>
      <Field id={`${id}-categorie`} label="Type">
        <Select
          value={saisie.category}
          options={CATEGORIES.map((c) => ({ valeur: c.code, libelle: c.libelle }))}
          onChange={(e) => maj('category', e.target.value)}
        />
      </Field>
      <Field
        id={`${id}-libelle`}
        label="Antécédent"
        requis
        aide={EXEMPLES[saisie.category]}
        erreur={erreurs.label}
      >
        <Input
          ref={caseLibelle}
          maxLength={LIBELLE_MAX}
          autoComplete="off"
          value={saisie.label}
          onChange={(e) => maj('label', e.target.value)}
        />
      </Field>
      <Field id={`${id}-annee`} label="Depuis l’année" facultatif erreur={erreurs.annee}>
        <Input
          mono
          inputMode="numeric"
          maxLength={4}
          autoComplete="off"
          value={saisie.annee}
          onChange={(e) => maj('annee', e.target.value)}
        />
      </Field>
      <Field id={`${id}-details`} label="Précisions" facultatif>
        <Textarea
          rows={2}
          maxLength={DETAILS_MAX}
          value={saisie.details}
          onChange={(e) => maj('details', e.target.value)}
        />
      </Field>
      {habilite && (
        <Checkbox
          label="Antécédent sensible"
          description={
            dejaSensible
              ? 'Un antécédent sensible le reste.'
              : sensibleParDefaut && !modification && saisie.is_sensitive
                ? 'Cochée d’office parce que cette consultation est sensible. Décochez si cet antécédent ne l’est pas (une césarienne, par exemple).'
                : 'VIH / PTME, santé mentale… Réservé aux soignants habilités ; chaque ouverture est enregistrée.'
          }
          checked={saisie.is_sensitive}
          disabled={dejaSensible}
          onChange={(e) => maj('is_sensitive', e.target.checked)}
        />
      )}
      {echec && (
        <Message ton="erreur" titre="Antécédent non enregistré">
          <p>{echec}</p>
          <p>Votre saisie est gardée : réessayez.</p>
        </Message>
      )}
      {ajoutes > 0 && !echec && (
        <p className="formulaire-antecedent__ajoutes" role="status">
          {ajoutes > 1 ? `${ajoutes} antécédents ajoutés.` : 'Antécédent ajouté.'} Vous pouvez en
          saisir un autre.
        </p>
      )}
      <div className="formulaire-antecedent__actions">
        <Button variante="secondaire" onClick={onFermer} disabled={envoi}>
          {ajoutes > 0 ? 'Fermer' : 'Annuler'}
        </Button>
        <Button type="submit" chargement={envoi} disabled={!enLigne}>
          {modification ? 'Enregistrer' : 'Ajouter'}
        </Button>
      </div>
      {!enLigne && (
        <p className="formulaire-antecedent__hors-ligne">
          Pas de connexion : votre saisie reste à l’écran. Enregistrez-la au retour du réseau.
        </p>
      )}
    </form>
  )
}
