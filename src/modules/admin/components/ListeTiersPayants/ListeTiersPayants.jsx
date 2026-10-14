import { Plus, Trash2 } from 'lucide-react'
import { useId } from 'react'
import Button from '../../../../components/ui/Button/Button.jsx'
import Field from '../../../../components/ui/Field/Field.jsx'
import Icone from '../../../../components/ui/Icone/Icone.jsx'
import Input from '../../../../components/ui/Input/Input.jsx'
import ChampTaux from '../ChampTaux/ChampTaux.jsx'
import './ListeTiersPayants.css'

// Une famille de tiers payants (mutuelles, IPM, assurances) : noms saisis librement.
// erreurs : { [id]: { name, coverage_rate } }.
export default function ListeTiersPayants({
  famille,
  lignes,
  erreurs = {},
  onChange,
  onAjouter,
  onRetirer,
}) {
  const idTitre = useId()
  return (
    <section className="liste-tiers-payants" aria-labelledby={idTitre}>
      <h3 id={idTitre} className="liste-tiers-payants__titre">
        {famille.titre}
      </h3>
      {lignes.length > 0 && (
        <ul className="liste-tiers-payants__liste">
          {lignes.map((ligne, index) => {
            const nom = ligne.name.trim() || `${famille.titre} ${index + 1}`
            return (
              <li key={ligne.id} className="liste-tiers-payants__ligne">
                <Field
                  id={`tiers-${ligne.id}-name`}
                  label="Nom"
                  aide={famille.exemple}
                  erreur={erreurs[ligne.id]?.name}
                >
                  <Input
                    autoComplete="off"
                    maxLength={160}
                    value={ligne.name}
                    onChange={(e) => onChange(ligne.id, 'name', e.target.value)}
                  />
                </Field>
                <ChampTaux
                  id={`tiers-${ligne.id}-taux`}
                  nom={nom}
                  value={ligne.coverage_rate}
                  erreur={erreurs[ligne.id]?.coverage_rate}
                  onChange={(valeur) => onChange(ligne.id, 'coverage_rate', valeur)}
                />
                <Button
                  variante="discret"
                  className="liste-tiers-payants__retirer"
                  iconeDebut={<Icone icone={Trash2} />}
                  onClick={() => onRetirer(ligne)}
                  aria-label={`Retirer ${nom}`}
                >
                  Retirer
                </Button>
              </li>
            )
          })}
        </ul>
      )}
      <Button variante="secondaire" iconeDebut={<Icone icone={Plus} />} onClick={onAjouter}>
        {famille.ajouter}
      </Button>
    </section>
  )
}
