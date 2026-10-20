import { Trash2 } from 'lucide-react'
import Button from '../../../../components/ui/Button/Button.jsx'
import Icone from '../../../../components/ui/Icone/Icone.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import Radio from '../../../../components/ui/Radio/Radio.jsx'
import Tampon from '../../../../components/ui/Tampon/Tampon.jsx'
import {
  ajouterDiagnostic,
  diagnosticDepuisCatalogue,
  DIAGNOSTICS_MAX,
  libelleDeclaration,
  rendrePrincipal,
  retirerDiagnostic,
} from '../../utils.js'
import RechercheDiagnostic from '../RechercheDiagnostic/RechercheDiagnostic.jsx'
import './Diagnostics.css'

// Diagnostics de la consultation : un principal, des secondaires. Le premier ajouté est
// principal ; un autre le devient d'un clic.
export default function Diagnostics({ orgId, valeur, onChange, erreur, desactive }) {
  return (
    <div className="diagnostics">
      {valeur.length > 0 ? (
        <ul className="diagnostics__liste" aria-label="Diagnostics retenus">
          {valeur.map((d, i) => {
            const declaration = libelleDeclaration(d.is_notifiable ? d.notification_delay : null)
            return (
              <li key={d.catalog_id ?? `libre-${i}`} className="diagnostics__ligne">
                <p className="diagnostics__nom">
                  {d.code && <span className="diagnostics__code">{d.code}</span>}
                  <span>{d.label}</span>
                  {!d.catalog_id && <span className="diagnostics__libre">sans code</span>}
                </p>
                <span className="diagnostics__marques">
                  {declaration && (
                    <Tampon ton={d.notification_delay === 'immediate' ? 'alerte' : 'encre'}>
                      {declaration}
                    </Tampon>
                  )}
                  {d.is_sensitive && <Tampon ton="encre">Sensible</Tampon>}
                </span>
                <fieldset className="diagnostics__rang">
                  <legend className="sr-only">{`Rang de « ${d.label} »`}</legend>
                  <Radio
                    name={`rang-${i}`}
                    label="Principal"
                    checked={d.rank === 'primary'}
                    disabled={desactive}
                    onChange={() => onChange(rendrePrincipal(valeur, i))}
                  />
                  <Radio
                    name={`rang-${i}`}
                    label="Secondaire"
                    checked={d.rank !== 'primary'}
                    disabled={desactive || d.rank === 'primary'}
                    onChange={() => {}}
                  />
                </fieldset>
                <span className="diagnostics__retirer">
                  <Button
                    variante="discret"
                    iconeDebut={<Icone icone={Trash2} />}
                    disabled={desactive}
                    aria-label={`Retirer le diagnostic ${d.label}`}
                    onClick={() => onChange(retirerDiagnostic(valeur, i))}
                  >
                    Retirer
                  </Button>
                </span>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="diagnostics__vide">Aucun diagnostic pour l’instant.</p>
      )}
      {erreur && (
        <Message ton="erreur">
          <p>{erreur}</p>
        </Message>
      )}
      {valeur.length < DIAGNOSTICS_MAX ? (
        <RechercheDiagnostic
          orgId={orgId}
          dejaChoisis={valeur.map((d) => d.catalog_id).filter(Boolean)}
          desactive={desactive}
          onChoisir={(r) =>
            onChange(
              ajouterDiagnostic(
                valeur,
                r.id
                  ? diagnosticDepuisCatalogue(r)
                  : { catalog_id: null, code: null, label: r.label },
              ),
            )
          }
        />
      ) : (
        <p className="diagnostics__vide">{`${DIAGNOSTICS_MAX} diagnostics au plus.`}</p>
      )}
    </div>
  )
}
