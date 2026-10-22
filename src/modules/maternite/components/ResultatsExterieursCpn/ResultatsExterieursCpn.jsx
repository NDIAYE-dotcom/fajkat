import { Plus, Trash2 } from 'lucide-react'
import Button from '../../../../components/ui/Button/Button.jsx'
import Icone from '../../../../components/ui/Icone/Icone.jsx'
import Tampon from '../../../../components/ui/Tampon/Tampon.jsx'
import { nouvelIdentifiant } from '../../api.js'
import ChampsResultat from '../ChampsResultat/ChampsResultat.jsx'
import './ResultatsExterieursCpn.css'

const MAX = 20

// Résultats d'un laboratoire extérieur apportés à la CPN (papier du labo) : examen, date,
// laboratoire, résultat. Recopiés à la validation ; un examen sensible (VIH, syphilis,
// hépatite B) rend la consultation sensible. Chaque ligne garde son identifiant d'envoi.
// erreurs : { [index]: message }.
export default function ResultatsExterieursCpn({
  examens,
  valeur,
  erreurs = {},
  desactive,
  onChange,
}) {
  const actifs = examens.filter((e) => e.is_active)
  const maj = (i, champs) => onChange(valeur.map((t, j) => (j === i ? { ...t, ...champs } : t)))

  return (
    <fieldset className="soins-cpn__bloc">
      <legend className="soins-cpn__titre">Résultats d’un laboratoire extérieur</legend>
      {valeur.length === 0 && (
        <p className="soins-cpn__aide">
          La patiente apporte un résultat fait ailleurs ? Notez-le ici : il compte dans les examens
          de la grossesse.
        </p>
      )}
      {valeur.length > 0 && (
        <ul className="resultats-exterieurs">
          {valeur.map((t, i) => {
            const type = examens.find((e) => e.id === t.rapid_test_type_id)
            return (
              <li key={t.client_id ?? i} className="resultats-exterieurs__ligne">
                <div className="resultats-exterieurs__entete">
                  <span className="resultats-exterieurs__nom">Résultat extérieur {i + 1}</span>
                  {type?.is_sensitive && <Tampon ton="encre">Sensible</Tampon>}
                  <Button
                    variante="discret"
                    iconeDebut={<Icone icone={Trash2} />}
                    disabled={desactive}
                    onClick={() => onChange(valeur.filter((_, j) => j !== i))}
                    aria-label={`Retirer le résultat extérieur ${i + 1}`}
                  >
                    Retirer
                  </Button>
                </div>
                <ChampsResultat
                  prefixe={`resultat-cpn-${i}`}
                  examens={actifs}
                  valeur={t}
                  desactive={desactive}
                  onChange={(champs) => maj(i, champs)}
                />
                {erreurs[i] && (
                  <p className="resultats-exterieurs__erreur" role="alert">
                    {erreurs[i]}
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {valeur.length < MAX && (
        <div>
          <Button
            variante="secondaire"
            iconeDebut={<Icone icone={Plus} />}
            disabled={desactive}
            onClick={() =>
              onChange([
                ...valeur,
                {
                  client_id: nouvelIdentifiant(),
                  rapid_test_type_id: '',
                  taken_on: null,
                  lab_name: '',
                },
              ])
            }
          >
            Noter un résultat extérieur
          </Button>
        </div>
      )}
    </fieldset>
  )
}
