import Message from '../../../../components/ui/Message/Message.jsx'
import Radio from '../../../../components/ui/Radio/Radio.jsx'
import { differe, LIGNES_COMPARAISON } from '../../fusion.js'
import './FusionComparaison.css'

// Étape 2 de la fusion : les deux identités côte à côte (jamais de donnée médicale), les
// différences signalées par un mot et pas seulement par la couleur, puis le choix du
// dossier qu'on garde. Aucun choix par défaut : la personne tranche.
export default function FusionComparaison({ a, b, gardeId, onGarder }) {
  const sexeDifferent = a.sex !== b.sex
  const colonnes = [
    { patient: a, titre: 'Ce dossier' },
    { patient: b, titre: 'L’autre dossier' },
  ]

  return (
    <div className="fusion-comparaison">
      {sexeDifferent && (
        <Message ton="erreur" titre="Sexe différent">
          <p>Vérifiez avec la personne qu’il s’agit bien d’elle dans les deux dossiers.</p>
        </Message>
      )}
      <fieldset className="fusion-comparaison__choix">
        <legend className="fusion-comparaison__legende">Quel dossier gardez-vous ?</legend>
        <p className="fusion-comparaison__aide">
          Le dossier gardé conserve ses informations ; ses cases vides sont complétées par l’autre.
          L’autre dossier renverra ensuite vers lui.
        </p>
        <div className="fusion-comparaison__options">
          {colonnes.map(({ patient, titre }) => (
            <Radio
              key={patient.id}
              name="fusion-garde"
              label={`Garder ${titre.toLowerCase()}`}
              description={patient.file_number}
              checked={gardeId === patient.id}
              onChange={() => onGarder(patient.id)}
            />
          ))}
        </div>
      </fieldset>

      <div className="fusion-comparaison__cadre">
        <table className="fusion-comparaison__table">
          <caption className="fusion-comparaison__titre-table">
            Comparaison des deux dossiers
          </caption>
          <thead>
            <tr>
              <td />
              {colonnes.map(({ patient, titre }) => (
                <th
                  key={patient.id}
                  scope="col"
                  className={`fusion-comparaison__entete${gardeId === patient.id ? ' fusion-comparaison__entete--garde' : ''}`}
                >
                  {titre}
                  {gardeId === patient.id && (
                    <span className="fusion-comparaison__garde">gardé</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {LIGNES_COMPARAISON.map((ligne) => {
              const different = differe(ligne, a, b)
              return (
                <tr
                  key={ligne.cle}
                  className={`fusion-comparaison__ligne${different ? ' fusion-comparaison__ligne--differe' : ''}`}
                >
                  <th scope="row" className="fusion-comparaison__libelle">
                    {ligne.libelle}
                    {different && <span className="fusion-comparaison__mot">différent</span>}
                  </th>
                  {colonnes.map(({ patient }) => {
                    const valeur = ligne.valeur(patient)
                    return (
                      <td
                        key={patient.id}
                        className={`fusion-comparaison__valeur${ligne.mono ? ' fusion-comparaison__valeur--mono' : ''}${valeur ? '' : ' fusion-comparaison__valeur--vide'}`}
                      >
                        {valeur || 'vide'}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
