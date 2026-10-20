import { ArrowDown, ArrowUp, Trash2, TriangleAlert } from 'lucide-react'
import { useId } from 'react'
import BoutonIcone from '../../../../components/ui/BoutonIcone/BoutonIcone.jsx'
import Button from '../../../../components/ui/Button/Button.jsx'
import Field from '../../../../components/ui/Field/Field.jsx'
import Icone from '../../../../components/ui/Icone/Icone.jsx'
import Input from '../../../../components/ui/Input/Input.jsx'
import Select from '../../../../components/ui/Select/Select.jsx'
import {
  CONSIGNES,
  dosageDouteux,
  LIBELLES_PRISES,
  normaliserDosage,
  PRISES,
  repartirDoses,
} from '../../ordonnance.js'
import ChampMedicament from '../ChampMedicament/ChampMedicament.jsx'
import DureeQuantite from '../DureeQuantite/DureeQuantite.jsx'
import PictogrammePrise from '../PictogrammePrise/PictogrammePrise.jsx'
import './LigneOrdonnance.css'

// Une ligne de l'ordonnance en saisie. Clavier : Entrée passe à la case suivante, et crée
// la ligne suivante depuis la dernière case ; « 1-0-1 » tapé dans une case de posologie
// se répartit sur les cases suivantes à la sortie de la case.
//   onChange(champs) : champs modifiés ({ saisies: { matin: '1' } }, { form_code }…).
export default function LigneOrdonnance({
  ligne: l,
  index,
  total,
  orgId,
  formes,
  voies,
  erreurs = {},
  desactive,
  refNom,
  onChange,
  onChoisir,
  onDeplacer,
  onSupprimer,
  onNouvelleLigne,
  onRecalculer,
}) {
  const id = useId()
  const forme = formes.find((f) => f.code === l.form_code)
  const nom = l.product_name.trim() || `ligne ${index + 1}`
  const douteux = dosageDouteux(l.dosage)

  // Entrée : case suivante de la ligne ; depuis la dernière, nouvelle ligne.
  function surTouche(e) {
    if (e.key !== 'Enter' || e.defaultPrevented) return
    const cible = e.target
    if (!(cible.matches?.('input:not([type=checkbox]), select') && cible.dataset.saisie)) return
    e.preventDefault()
    const cases = [...e.currentTarget.querySelectorAll('[data-saisie]:not(:disabled)')]
    const suivante = cases[cases.indexOf(cible) + 1]
    if (suivante) suivante.focus()
    else onNouvelleLigne()
  }

  function surSortieDose(k, texte) {
    const doses = repartirDoses(texte)
    if (!doses) return
    const saisies = {}
    doses.forEach((d, j) => {
      if (PRISES[k + j]) saisies[PRISES[k + j].cle] = d
    })
    onChange({ saisies })
  }

  const formesOptions = formes.map((f) => ({ valeur: f.code, libelle: f.label }))
  // Forme d'un ancien brouillon absente du référentiel : gardée telle quelle.
  if (l.form && !forme) formesOptions.unshift({ valeur: '', libelle: l.form })

  return (
    <li className="ligne-ordonnance" onKeyDown={surTouche}>
      <div className="ligne-ordonnance__entete">
        <span className="ligne-ordonnance__numero" aria-hidden="true">
          {index + 1}
        </span>
        <div className="ligne-ordonnance__nom">
          <Field label="Médicament" requis erreur={erreurs.product_name}>
            <ChampMedicament
              ref={refNom}
              orgId={orgId}
              valeur={l.product_name}
              disabled={desactive}
              data-saisie="nom"
              placeholder="Paracétamol, amoxicilline…"
              onChange={(v) => onChange({ product_name: v })}
              onChoisir={onChoisir}
            />
          </Field>
        </div>
        <div className="ligne-ordonnance__actions">
          <BoutonIcone
            icone={ArrowUp}
            label={`Monter ${nom}`}
            disabled={desactive || index === 0}
            onClick={() => onDeplacer(-1)}
          />
          <BoutonIcone
            icone={ArrowDown}
            label={`Descendre ${nom}`}
            disabled={desactive || index === total - 1}
            onClick={() => onDeplacer(1)}
          />
          <Button
            variante="discret"
            iconeDebut={<Icone icone={Trash2} />}
            disabled={desactive}
            aria-label={`Retirer ${nom}`}
            onClick={onSupprimer}
          >
            Retirer
          </Button>
        </div>
      </div>

      <div className="ligne-ordonnance__produit">
        <Field label="Dosage" facultatif>
          <Input
            value={l.dosage}
            maxLength={60}
            disabled={desactive}
            data-saisie="dosage"
            placeholder="500 mg"
            aria-describedby={douteux ? `${id}-dosage` : undefined}
            onChange={(e) => onChange({ dosage: e.target.value })}
            // « 500mg » devient « 500 mg » à la sortie de la case.
            onBlur={(e) => {
              const propre = normaliserDosage(e.target.value)
              if (propre !== e.target.value) onChange({ dosage: propre })
            }}
          />
          {douteux && (
            <p id={`${id}-dosage`} className="ligne-ordonnance__alerte">
              <Icone icone={TriangleAlert} />
              {`Vérifiez le dosage : ${douteux} ?`}
            </p>
          )}
        </Field>
        <Field label="Forme" facultatif>
          <Select
            value={l.form_code}
            disabled={desactive}
            data-saisie="forme"
            placeholder="Choisir"
            options={formesOptions}
            onChange={(e) => onChange({ form_code: e.target.value })}
          />
        </Field>
        <Field label="Voie" facultatif>
          <Select
            value={l.route_code}
            disabled={desactive}
            data-saisie="voie"
            placeholder="Choisir"
            options={voies.map((v) => ({ valeur: v.code, libelle: v.label }))}
            onChange={(e) => onChange({ route_code: e.target.value })}
          />
        </Field>
      </div>

      <fieldset className="ligne-ordonnance__posologie">
        <legend className="ligne-ordonnance__legende">
          {`Posologie${forme ? ` (${forme.dose_unit_plural} par prise)` : ''}`}
          <span className="ligne-ordonnance__aide">
            {' · 1, 2, 1/2 ou 0,5 ; « 1-0-1 » remplit les cases'}
          </span>
        </legend>
        {PRISES.map((p, k) => (
          <Field
            key={p.cle}
            label={
              <span className="ligne-ordonnance__prise">
                <PictogrammePrise prise={p.cle} />
                {LIBELLES_PRISES.fr[p.cle]}
              </span>
            }
            erreur={erreurs[p.cle]}
          >
            <Input
              mono
              inputMode="decimal"
              className="ligne-ordonnance__dose"
              value={l.saisies[p.cle]}
              disabled={desactive}
              data-saisie={p.cle}
              placeholder="0"
              onChange={(e) => onChange({ saisies: { [p.cle]: e.target.value } })}
              onBlur={(e) => surSortieDose(k, e.target.value)}
            />
          </Field>
        ))}
      </fieldset>

      <DureeQuantite
        ligne={l}
        forme={forme}
        erreurs={erreurs}
        desactive={desactive}
        onChange={onChange}
        onRecalculer={onRecalculer}
      />

      <Field label="Consignes" facultatif erreur={erreurs.instructions}>
        <Input
          value={l.instructions}
          maxLength={300}
          list={`${id}-consignes`}
          disabled={desactive}
          data-saisie="consignes"
          placeholder="Après le repas…"
          onChange={(e) => onChange({ instructions: e.target.value })}
        />
      </Field>
      <datalist id={`${id}-consignes`}>
        {CONSIGNES.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
    </li>
  )
}
