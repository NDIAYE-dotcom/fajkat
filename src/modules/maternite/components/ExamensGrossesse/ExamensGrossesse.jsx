import { useQueryClient } from '@tanstack/react-query'
import { FlaskConical } from 'lucide-react'
import { useState } from 'react'
import Button from '../../../../components/ui/Button/Button.jsx'
import Icone from '../../../../components/ui/Icone/Icone.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import Skeleton from '../../../../components/ui/Skeleton/Skeleton.jsx'
import Tampon from '../../../../components/ui/Tampon/Tampon.jsx'
import { useEnLigne } from '../../../../hooks/useEnLigne.js'
import { useToast } from '../../../../hooks/useToast.js'
import { formatDate } from '../../../../lib/format.js'
import { libelleResultat } from '../../../consultations/utils.js'
import { cles, retirerResultatExterieur } from '../../api.js'
import { useExamensGrossesse } from '../../hooks/useMaternite.js'
import ModaleMotif from '../ModaleMotif/ModaleMotif.jsx'
import ModaleResultatExterieur from '../ModaleResultatExterieur/ModaleResultatExterieur.jsx'
import './ExamensGrossesse.css'

const nombre = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 })

// Examens de la grossesse (soignants habilités seulement : le composant n'est pas monté pour
// les autres) : pour chaque examen de la liste, résultats des consultations validées et des
// laboratoires extérieurs, le plus récent d'abord, ou « À faire » ; groupe sanguin et rhésus.
// Chaque ouverture de l'écran avec un résultat sensible est journalisée une fois.
export default function ExamensGrossesse({ grossesseId }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const enLigne = useEnLigne()
  const requete = useExamensGrossesse(grossesseId, true)
  const [fenetre, setFenetre] = useState(null) // 'resultat' | { retrait: resultat }

  async function apres(message) {
    setFenetre(null)
    await queryClient.invalidateQueries({ queryKey: cles.examens(grossesseId) })
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
  const examens = d.tests.map((t) => ({
    id: t.rapid_test_type_id,
    label: t.label,
    result_kind: t.result_kind,
    unit: t.unit,
    is_sensitive: t.is_sensitive,
    is_active: true,
  }))

  return (
    <section className="examens-grossesse" aria-labelledby="examens-grossesse-titre">
      <div className="examens-grossesse__entete">
        <h3 id="examens-grossesse-titre" className="examens-grossesse__titre">
          Examens de la grossesse
        </h3>
        <Button
          variante="secondaire"
          iconeDebut={<Icone icone={FlaskConical} />}
          disabled={!enLigne || examens.length === 0}
          onClick={() => setFenetre('resultat')}
        >
          Noter un résultat d’un laboratoire
        </Button>
      </div>
      <p className="examens-grossesse__groupe">
        Groupe sanguin et rhésus :{' '}
        {d.blood_group ? (
          <span className="examens-grossesse__chiffres">{d.blood_group}</span>
        ) : (
          'non renseigné'
        )}
      </p>
      <ul className="examens-grossesse__liste">
        {d.tests.map((t) => (
          <li key={t.rapid_test_type_id} className="examens-grossesse__examen">
            <div className="examens-grossesse__tete">
              <span className="examens-grossesse__nom">{t.label}</span>
              {t.is_sensitive && <Tampon ton="encre">Sensible</Tampon>}
              {t.results.length === 0 && <span className="examens-grossesse__afaire">À faire</span>}
            </div>
            {t.results.length > 0 && (
              <ol className="examens-grossesse__resultats">
                {t.results.map((r, n) => (
                  <li
                    key={r.external_id ?? `${r.encounter_id}-${n}`}
                    className="examens-grossesse__resultat"
                  >
                    <span className="examens-grossesse__valeur">{texteResultat(r, t.unit)}</span>
                    <span className="examens-grossesse__chiffres">{formatDate(r.date)}</span>
                    <span className="examens-grossesse__doux">
                      {r.source === 'external' ? `Résultat externe · ${r.lab_name}` : 'Fait ici'}
                    </span>
                    {r.source === 'external' && (
                      <Button
                        variante="discret"
                        disabled={!enLigne}
                        onClick={() => setFenetre({ retrait: { ...r, label: t.label } })}
                      >
                        Retirer
                      </Button>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </li>
        ))}
      </ul>

      {fenetre === 'resultat' && (
        <ModaleResultatExterieur
          grossesseId={grossesseId}
          examens={examens}
          onFermer={() => setFenetre(null)}
          onNote={() => apres('Résultat noté')}
        />
      )}
      {fenetre?.retrait && (
        <ModaleMotif
          titre={`Retirer ce résultat (${fenetre.retrait.label}) ?`}
          texte="Résultat d’un laboratoire extérieur noté par erreur. Il n’est jamais effacé : le journal du dossier le garde."
          action="Retirer"
          aideMotif="Indiquez pourquoi ce résultat est retiré."
          onFermer={() => setFenetre(null)}
          onConfirmer={async (motif) => {
            await retirerResultatExterieur(fenetre.retrait.external_id, motif)
            await apres('Résultat retiré')
          }}
        />
      )}
    </section>
  )
}

function texteResultat(r, unite) {
  if (r.result) return libelleResultat(r.result)
  if (r.value_number !== null && r.value_number !== undefined) {
    return `${nombre.format(Number(r.value_number))}${r.unit || unite ? ` ${r.unit || unite}` : ''}`
  }
  return r.value_text ?? '—'
}
