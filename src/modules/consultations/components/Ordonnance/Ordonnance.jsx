import { Plus } from 'lucide-react'
import { useRef } from 'react'
import Button from '../../../../components/ui/Button/Button.jsx'
import Field from '../../../../components/ui/Field/Field.jsx'
import Icone from '../../../../components/ui/Icone/Icone.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import Textarea from '../../../../components/ui/Textarea/Textarea.jsx'
import { useFormesMedicament, useVoies } from '../../hooks/useOrdonnance.js'
import {
  deplacer,
  LIGNES_MAX,
  majLigne,
  normaliserOrdonnance,
  NOTE_MAX,
  nouvelleLigne,
  recalculerQuantite,
} from '../../ordonnance.js'
import LigneOrdonnance from '../LigneOrdonnance/LigneOrdonnance.jsx'
import './Ordonnance.css'

// Ordonnance en saisie, dans le brouillon de la consultation : elle est enregistrée avec
// lui (appareil à chaque frappe, serveur toutes les 10 s) et figée à la validation.
//   valeur : { note, items } ; erreurs : { note?, lignes?: { [cle]: { champ: message } } }.
export default function Ordonnance({ orgId, valeur, onChange, erreurs = {}, desactive }) {
  const formes = useFormesMedicament()
  const voies = useVoies()
  const ord = normaliserOrdonnance(valeur)
  // Ligne qui vient d'être ajoutée : son champ « Médicament » prend le focus à l'affichage.
  const aFocaliser = useRef(null)

  const listeFormes = formes.data ?? []
  const maj = (items) => onChange({ ...ord, items })
  const majUne = (cle, champs) =>
    maj(ord.items.map((l) => (l.cle === cle ? majLigne(l, champs, listeFormes) : l)))

  function ajouter() {
    if (ord.items.length >= LIGNES_MAX) return
    const l = nouvelleLigne()
    aFocaliser.current = l.cle
    maj([...ord.items, l])
  }

  // Suggestion choisie : nom, et dosage, forme et voie de la dernière prescription s'ils
  // ne sont pas encore saisis.
  function choisir(cle, s) {
    const ligne = ord.items.find((l) => l.cle === cle)
    const forme = listeFormes.find((f) => f.label === s.form)
    const champs = { product_name: s.product_name }
    if (!ligne.dosage.trim() && s.dosage) champs.dosage = s.dosage
    if (!ligne.form_code && forme) champs.form_code = forme.code
    if (!ligne.route_code && s.route_code) champs.route_code = s.route_code
    majUne(cle, champs)
  }

  return (
    <div className="ordonnance">
      {(formes.error || voies.error) && (
        <Message
          ton="erreur"
          action={
            <Button
              variante="secondaire"
              onClick={() => {
                formes.refetch()
                voies.refetch()
              }}
            >
              Réessayer
            </Button>
          }
        >
          <p>
            Les formes et les voies n’ont pas pu être lues. Vous pouvez continuer : le nom, la
            posologie et la durée suffisent.
          </p>
        </Message>
      )}
      {ord.items.length === 0 ? (
        <p className="ordonnance__vide">Aucun médicament prescrit.</p>
      ) : (
        <ol className="ordonnance__lignes">
          {ord.items.map((l, i) => (
            <LigneOrdonnance
              key={l.cle}
              ligne={l}
              index={i}
              total={ord.items.length}
              orgId={orgId}
              formes={listeFormes}
              voies={voies.data ?? []}
              erreurs={erreurs.lignes?.[l.cle]}
              desactive={desactive}
              refNom={(el) => {
                if (el && aFocaliser.current === l.cle) {
                  aFocaliser.current = null
                  el.focus()
                }
              }}
              onChange={(champs) => majUne(l.cle, champs)}
              onChoisir={(s) => choisir(l.cle, s)}
              onDeplacer={(sens) => maj(deplacer(ord.items, i, sens))}
              onSupprimer={() => maj(ord.items.filter((x) => x.cle !== l.cle))}
              onRecalculer={() =>
                maj(
                  ord.items.map((x) => (x.cle === l.cle ? recalculerQuantite(x, listeFormes) : x)),
                )
              }
              onNouvelleLigne={ajouter}
            />
          ))}
        </ol>
      )}
      {ord.items.length < LIGNES_MAX ? (
        <div>
          <Button
            variante="secondaire"
            iconeDebut={<Icone icone={Plus} />}
            disabled={desactive}
            onClick={ajouter}
          >
            Ajouter un médicament
          </Button>
        </div>
      ) : (
        <p className="ordonnance__vide">{`${LIGNES_MAX} médicaments au plus par ordonnance.`}</p>
      )}
      {ord.items.length > 0 && (
        <Field label="Remarque imprimée sur l’ordonnance" facultatif erreur={erreurs.note}>
          <Textarea
            rows={2}
            maxLength={NOTE_MAX}
            value={ord.note}
            disabled={desactive}
            placeholder="Revenir si la fièvre persiste après 3 jours."
            onChange={(e) => onChange({ ...ord, note: e.target.value })}
          />
        </Field>
      )}
    </div>
  )
}
