import Button from '../../../../components/ui/Button/Button.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import Spinner from '../../../../components/ui/Spinner/Spinner.jsx'
import { libelleProposition } from '../../prise.js'
import './ControleRdv.css'

// Résultat du contrôle par la base (useEnvoiRdv) :
//   - refus (séance pleine, date passée…) avec la raison ; séance pleine : les prochaines
//     séances qui ont des places, à choisir d'un clic ;
//   - avertissements (jour férié, pause, autre rendez-vous du patient…) : à confirmer.
export default function ControleRdv({
  controle,
  propositions,
  envoi,
  desactive,
  onChoisir,
  onConfirmer,
}) {
  if (!controle) return null
  const { bloquants, alertes } = controle

  if (bloquants.length > 0) {
    const plein = bloquants.some((b) => b.code === 'full')
    return (
      <Message ton="erreur" titre={plein ? 'Séance pleine' : 'Rendez-vous impossible'}>
        {bloquants.map((b) => (
          <p key={b.message}>{b.message}</p>
        ))}
        {plein && propositions && (
          <div className="controle-rdv__propositions">
            {propositions.chargement && <Spinner libelle="Recherche des prochaines séances…" />}
            {propositions.erreur && <p>{propositions.erreur}</p>}
            {!propositions.chargement && !propositions.erreur && (
              <>
                <p className="controle-rdv__titre">
                  {propositions.liste.length > 0
                    ? 'Prochaines séances avec des places :'
                    : 'Aucune séance avec des places dans les quatre prochains mois.'}
                </p>
                {propositions.liste.length > 0 && (
                  <ul className="controle-rdv__liste">
                    {propositions.liste.map((p) => (
                      <li key={`${p.local_date}-${p.start_time}`}>
                        <Button
                          variante="secondaire"
                          className="controle-rdv__choix"
                          onClick={() => onChoisir(p)}
                        >
                          {libelleProposition(p)}
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        )}
      </Message>
    )
  }

  return (
    <Message
      ton="info"
      titre="À confirmer"
      action={
        <Button chargement={envoi} disabled={desactive} onClick={onConfirmer}>
          Confirmer le rendez-vous
        </Button>
      }
    >
      {alertes.map((a) => (
        <p key={a.message}>{a.message.replace(/^À confirmer : /, '')}</p>
      ))}
    </Message>
  )
}
