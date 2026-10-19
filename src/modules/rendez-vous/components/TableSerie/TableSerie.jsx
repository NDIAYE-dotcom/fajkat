import { useState } from 'react'
import Button from '../../../../components/ui/Button/Button.jsx'
import Spinner from '../../../../components/ui/Spinner/Spinner.jsx'
import Tampon from '../../../../components/ui/Tampon/Tampon.jsx'
import { libelleProposition } from '../../prise.js'
import { aDeplacer, etatDate } from '../../serie.js'
import { dateLongue } from '../../utils.js'
import './TableSerie.css'

const TONS = { refus: 'alerte', alerte: 'encre', libre: 'primaire', attente: 'neutre' }

// Dates d'une série avec leur contrôle par la base. Une date refusée (séance pleine) ou sur
// un jour férié propose les prochaines séances libres, ou le jour suivant ; une date peut
// être retirée (2 au moins restent).
//   dates : [{ cle, date, heure }] ; controles : un contrôle par date (même ordre) ;
//   chercher(date) -> prochaines séances ; onChanger(index, proposition | 'suivant') ;
//   onRetirer(index).
export default function TableSerie({
  dates,
  controles,
  verification,
  desactive,
  chercher,
  onChanger,
  onRetirer,
}) {
  const [ouverte, setOuverte] = useState(null)
  const [propositions, setPropositions] = useState(null)

  async function proposer(index, date) {
    setOuverte(index)
    setPropositions({ chargement: true, liste: [] })
    try {
      setPropositions({ chargement: false, liste: await chercher(date) })
    } catch (e) {
      setPropositions({ chargement: false, liste: [], erreur: e.message })
    }
  }

  function choisir(index, choix) {
    setOuverte(null)
    setPropositions(null)
    onChanger(index, choix)
  }

  return (
    <ol className="table-serie" aria-busy={verification}>
      {dates.map((d, i) => {
        const etat = etatDate(verification ? null : controles?.[i])
        const deplacer = !verification && aDeplacer(controles?.[i])
        return (
          <li key={d.cle} className={`table-serie__ligne table-serie__ligne--${etat.code}`}>
            <span className="table-serie__numero">{i + 1}</span>
            <div className="table-serie__contenu">
              <p className="table-serie__quand">
                <span className="table-serie__date">{dateLongue(d.date)}</span>
                <span className="table-serie__heure">{d.heure}</span>
                <Tampon ton={TONS[etat.code]}>{etat.libelle}</Tampon>
              </p>
              {etat.messages.map((m) => (
                <p key={m} className="table-serie__message">
                  {m.replace(/^À confirmer : /, '')}
                </p>
              ))}
              <div className="table-serie__actions">
                {deplacer && (
                  <Button
                    variante="secondaire"
                    disabled={desactive}
                    onClick={() => proposer(i, d.date)}
                  >
                    Autres séances
                  </Button>
                )}
                {deplacer && (
                  <Button
                    variante="discret"
                    disabled={desactive}
                    onClick={() => choisir(i, 'suivant')}
                  >
                    Jour suivant
                  </Button>
                )}
                {dates.length > 2 && (
                  <Button variante="discret" disabled={desactive} onClick={() => onRetirer(i)}>
                    Retirer cette date
                  </Button>
                )}
              </div>
              {ouverte === i && propositions && (
                <div className="table-serie__propositions">
                  {propositions.chargement && <Spinner libelle="Recherche des séances…" />}
                  {propositions.erreur && <p>{propositions.erreur}</p>}
                  {!propositions.chargement && !propositions.erreur && (
                    <>
                      <p className="table-serie__message">
                        {propositions.liste.length
                          ? 'Prochaines séances avec des places :'
                          : 'Aucune séance avec des places : essayez « Jour suivant ».'}
                      </p>
                      {propositions.liste.map((p) => (
                        <Button
                          key={`${p.local_date}-${p.start_time}`}
                          variante="secondaire"
                          className="table-serie__choix"
                          onClick={() => choisir(i, p)}
                        >
                          {libelleProposition(p)}
                        </Button>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
