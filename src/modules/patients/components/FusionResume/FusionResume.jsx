import { TriangleAlert } from 'lucide-react'
import Field from '../../../../components/ui/Field/Field.jsx'
import Icone from '../../../../components/ui/Icone/Icone.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import Textarea from '../../../../components/ui/Textarea/Textarea.jsx'
import { resumeFusion } from '../../fusion.js'
import { nomComplet } from '../../utils.js'
import './FusionResume.css'

const numero = (p) => <span className="fusion-resume__numero">{p.file_number}</span>

// Étape 3 de la fusion : ce qui va se passer, en clair, avant la confirmation.
export default function FusionResume({ garde, fusionne, motif, onMotif, erreur }) {
  const { completes, ecartees } = resumeFusion(garde, fusionne)

  return (
    <div className="fusion-resume">
      <ul className="fusion-resume__liste">
        <li>
          Vous gardez le dossier {numero(garde)} de <strong>{nomComplet(garde)}</strong>.
        </li>
        <li>
          Le dossier {numero(fusionne)} de {nomComplet(fusionne)} sera fermé. Il restera dans le
          journal et renverra vers {numero(garde)} (lien, carte patient, QR).
        </li>
        <li>
          Ses couvertures et sa fiche médicale sont rattachées au dossier gardé. Rien n’est
          supprimé.
        </li>
      </ul>

      {completes.length > 0 && (
        <section className="fusion-resume__bloc" aria-labelledby="fusion-resume-completes">
          <h3 id="fusion-resume-completes" className="fusion-resume__titre">
            Complété depuis {fusionne.file_number}
          </h3>
          <dl className="fusion-resume__champs">
            {completes.map((c) => (
              <div key={c.libelle} className="fusion-resume__champ">
                <dt>{c.libelle}</dt>
                <dd>{c.valeur}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {ecartees.length > 0 && (
        <section className="fusion-resume__bloc" aria-labelledby="fusion-resume-ecartees">
          <h3 id="fusion-resume-ecartees" className="fusion-resume__titre">
            Valeurs différentes : celles de {garde.file_number} sont gardées
          </h3>
          <dl className="fusion-resume__champs">
            {ecartees.map((c) => (
              <div key={c.libelle} className="fusion-resume__champ">
                <dt>{c.libelle}</dt>
                <dd>
                  {c.gardee}
                  <span className="fusion-resume__ecartee">
                    {' '}
                    (et non « {c.ecartee} », gardé dans le journal de la fusion)
                  </span>
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <Field
        label="Motif"
        facultatif
        aide="Par exemple : « Même personne, nom mal orthographié à l’accueil »."
      >
        <Textarea
          rows={2}
          maxLength={300}
          value={motif}
          onChange={(e) => onMotif(e.target.value)}
        />
      </Field>

      <div className="fusion-resume__definitif" role="note">
        <Icone icone={TriangleAlert} className="fusion-resume__icone" />
        <p>
          <strong>La fusion ne peut pas être annulée depuis l’application.</strong> Vérifiez avec la
          personne avant de confirmer.
        </p>
      </div>

      {erreur && (
        <Message ton="erreur" titre="La fusion n’a pas abouti">
          <p>{erreur}</p>
        </Message>
      )}
    </div>
  )
}
