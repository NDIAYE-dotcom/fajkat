import { useQuery } from '@tanstack/react-query'
import Button from '../../../../components/ui/Button/Button.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import Skeleton from '../../../../components/ui/Skeleton/Skeleton.jsx'
import { formatDateHeure } from '../../../../lib/format.js'
import { chargerJournal, cles } from '../../api.js'
import { lireEntreeJournal } from '../../fiche.js'
import './JournalIdentite.css'

// Qui a modifié l'identité, quand, ancienne et nouvelle valeur (audit_logs, lisible par
// owner et admin). L'identité n'est pas médicale : les valeurs sont affichées.
export default function JournalIdentite({ patientId }) {
  const journal = useQuery({
    queryKey: cles.journal(patientId),
    queryFn: () => chargerJournal(patientId),
  })

  let corps
  if (journal.isPending) corps = <Skeleton largeur="70%" />
  else if (journal.error) {
    corps = (
      <Message ton="erreur" action={<Button onClick={() => journal.refetch()}>Réessayer</Button>}>
        <p>{journal.error.message}</p>
      </Message>
    )
  } else {
    const entrees = journal.data
      .map((e) => ({ ...e, lu: lireEntreeJournal(e) }))
      .filter((e) => e.lu.resume || e.lu.changements.length)
    corps = (
      <ol className="journal-identite__liste">
        {entrees.map((e) => (
          <li key={e.id} className="journal-identite__entree">
            <p className="journal-identite__quand">
              <span className="journal-identite__date">{formatDateHeure(e.created_at)}</span>
              {' · '}
              {e.auteur ?? 'Compte supprimé ou import'}
            </p>
            {e.lu.resume && <p>{e.lu.resume}</p>}
            {e.lu.motif && <p className="journal-identite__motif">Motif : {e.lu.motif}</p>}
            {e.lu.changements.length > 0 && (
              <ul className="journal-identite__changements">
                {e.lu.changements.map((c) => (
                  <li key={c.libelle}>
                    <span className="journal-identite__champ">{c.libelle}</span> : {c.avant}
                    {' → '}
                    {c.apres}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>
    )
  }

  return (
    <section className="journal-identite" aria-labelledby="journal-identite-titre">
      <h2 id="journal-identite-titre" className="journal-identite__titre">
        Modifications de l’identité
      </h2>
      <p className="journal-identite__aide">
        Visible par le propriétaire et les administrateurs. 30 dernières entrées.
      </p>
      {corps}
    </section>
  )
}
