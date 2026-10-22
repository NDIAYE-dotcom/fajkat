import { useQueryClient } from '@tanstack/react-query'
import { ClipboardPlus } from 'lucide-react'
import { useState } from 'react'
import Button from '../../../../components/ui/Button/Button.jsx'
import Icone from '../../../../components/ui/Icone/Icone.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import Skeleton from '../../../../components/ui/Skeleton/Skeleton.jsx'
import { useEnLigne } from '../../../../hooks/useEnLigne.js'
import { useToast } from '../../../../hooks/useToast.js'
import { formatDate } from '../../../../lib/format.js'
import { cles, retirerSoinAilleurs } from '../../api.js'
import { aujourdhuiStructure, formatSA } from '../../grossesse.js'
import { useSoinsGrossesse } from '../../hooks/useMaternite.js'
import { formatAPartirDe, libelleSoin } from '../../soins.js'
import ModaleMotif from '../ModaleMotif/ModaleMotif.jsx'
import ModaleSoinAilleurs from '../ModaleSoinAilleurs/ModaleSoinAilleurs.jsx'
import VaccinTd from '../VaccinTd/VaccinTd.jsx'
import './SoinsGrossesse.css'

// Soins de la grossesse (onglet Grossesse, rôles médicaux) : où en est chaque soin, soins
// faits ici ou ailleurs, Td ; conseils donnés pour les soignants habilités seulement (la
// base ne les envoie pas aux autres : la section n'existe pas pour eux). Jamais la
// situation de la grossesse ni le blocage d'un soin : partout ici, une femme sous
// cotrimoxazole ressemble à une femme qui n'a pas encore reçu la SP.
export default function SoinsGrossesse({ grossesseId, patientId, ecrire }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const enLigne = useEnLigne()
  const requete = useSoinsGrossesse(grossesseId)
  const [fenetre, setFenetre] = useState(null) // 'ailleurs' | { retrait: soin }

  async function apres(message) {
    setFenetre(null)
    await queryClient.invalidateQueries({ queryKey: cles.soins(grossesseId) })
    toast.succes(message)
  }

  if (requete.isPending) return <Skeleton forme="bloc" hauteur="8rem" />
  if (requete.error) {
    return (
      <Message ton="erreur" action={<Button onClick={() => requete.refetch()}>Réessayer</Button>}>
        <p>{requete.error.message}</p>
      </Message>
    )
  }
  const d = requete.data
  const ailleurs = d.care.filter((s) => s.allow_elsewhere)

  return (
    <>
      <section className="soins-grossesse" aria-labelledby="soins-grossesse-titre">
        <div className="soins-grossesse__entete">
          <h3 id="soins-grossesse-titre" className="soins-grossesse__titre">
            Soins préventifs
          </h3>
          {ecrire && ailleurs.length > 0 && (
            <Button
              variante="secondaire"
              iconeDebut={<Icone icone={ClipboardPlus} />}
              disabled={!enLigne}
              onClick={() => setFenetre('ailleurs')}
            >
              Noter un soin fait ailleurs
            </Button>
          )}
        </div>
        <ul className="soins-grossesse__etats">
          {d.care.map((s) => (
            <li key={s.type_id} className="soins-grossesse__etat">
              <span className="soins-grossesse__nom">{s.label}</span>
              <span className="soins-grossesse__doux">{texteEtat(s)}</span>
            </li>
          ))}
        </ul>
        {d.interventions.length > 0 && (
          <ol className="soins-grossesse__liste" aria-label="Soins notés pour cette grossesse">
            {d.interventions.map((i) => (
              <li key={i.id} className="soins-grossesse__ligne">
                <span className="soins-grossesse__chiffres">
                  {i.given_on ? formatDate(i.given_on) : 'Date non notée'}
                </span>
                <span className="soins-grossesse__nom">{libelleSoin(i)}</span>
                <span className="soins-grossesse__doux">
                  {[i.origin === 'here' ? 'Ici' : (i.place ?? 'Ailleurs'), formatSA(i.ga_days)]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
                {i.note && <span className="soins-grossesse__note">{i.note}</span>}
                {ecrire && i.origin === 'elsewhere' && (
                  <Button
                    variante="discret"
                    disabled={!enLigne}
                    onClick={() => setFenetre({ retrait: i })}
                  >
                    Retirer
                  </Button>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>

      <VaccinTd patientId={patientId} grossesseId={grossesseId} td={d.td} ecrire={ecrire} />

      {Array.isArray(d.counselling) && (
        <section className="soins-grossesse" aria-labelledby="conseils-grossesse-titre">
          <h3 id="conseils-grossesse-titre" className="soins-grossesse__titre">
            Conseils donnés
          </h3>
          {d.counselling.length === 0 ? (
            <p className="soins-grossesse__doux">Aucun conseil noté pendant les CPN.</p>
          ) : (
            <ul className="soins-grossesse__liste">
              {d.counselling.map((c, n) => (
                <li key={`${c.label}-${c.given_on}-${n}`} className="soins-grossesse__ligne">
                  <span className="soins-grossesse__chiffres">{formatDate(c.given_on)}</span>
                  <span className="soins-grossesse__nom">{c.label}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {fenetre === 'ailleurs' && (
        <ModaleSoinAilleurs
          grossesseId={grossesseId}
          types={ailleurs}
          onFermer={() => setFenetre(null)}
          onNote={() => apres('Soin noté')}
        />
      )}
      {fenetre?.retrait && (
        <ModaleMotif
          titre={`Retirer « ${libelleSoin(fenetre.retrait)} » ?`}
          texte="Soin noté d’après le carnet. Il n’est jamais effacé : le journal du dossier le garde."
          action="Retirer"
          aideMotif="Indiquez pourquoi ce soin est retiré."
          onFermer={() => setFenetre(null)}
          onConfirmer={async (motif) => {
            await retirerSoinAilleurs(fenetre.retrait.id, motif)
            await apres('Soin retiré')
          }}
        />
      )}
    </>
  )
}

// « 1 fois · SP 2 possible à partir du 19/11/2026 », « Fait », « Pas encore noté ». Une date
// déjà passée n'est pas affichée : le soin est possible dès aujourd'hui.
function texteEtat(s) {
  if (s.complete) return s.count > 1 ? `${s.count} fois · terminé` : 'Fait'
  const fait = s.count ? `${s.count} fois` : 'Pas encore noté'
  const suivant = s.numbered ? `${s.dose_label} ${s.next_number}` : null
  const quand =
    s.possible_from && s.possible_from > aujourdhuiStructure()
      ? formatAPartirDe(s.possible_from)
      : null
  if (suivant && quand) return `${fait} · ${suivant} possible ${quand}`
  if (quand && !s.count) return `${fait} · possible ${quand}`
  return fait
}
