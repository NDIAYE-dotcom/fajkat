import { useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus, Undo2 } from 'lucide-react'
import { useState } from 'react'
import Button from '../../../../components/ui/Button/Button.jsx'
import Icone from '../../../../components/ui/Icone/Icone.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import Modal from '../../../../components/ui/Modal/Modal.jsx'
import Skeleton from '../../../../components/ui/Skeleton/Skeleton.jsx'
import Tampon from '../../../../components/ui/Tampon/Tampon.jsx'
import { useEnLigne } from '../../../../hooks/useEnLigne.js'
import { useToast } from '../../../../hooks/useToast.js'
import { cles, enregistrerAntecedent, retirerAntecedent } from '../../api.js'
import { CATEGORIES, saisieAntecedent } from '../../dossier.js'
import { useAntecedents } from '../../hooks/useConsultation.js'
import FormulaireAntecedent from '../FormulaireAntecedent/FormulaireAntecedent.jsx'
import './Antecedents.css'

// Antécédents du patient, par catégorie (médicaux, chirurgicaux, gynéco-obstétricaux,
// familiaux, mode de vie), dans l'écran de consultation et sur la fiche du patient.
// La base ne renvoie un antécédent sensible qu'aux soignants habilités (aucune ligne pour
// les autres) et refuse tout aux rôles non médicaux.
// ecrire : soignant qui rédige ; habilite : peut marquer sensible ; consultationId :
// consultation d'où vient un ajout ; sensibleParDefaut : consultation sensible en cours.
export default function Antecedents({
  patientId,
  ecrire,
  habilite,
  consultationId = null,
  sensibleParDefaut = false,
}) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const enLigne = useEnLigne()
  const requete = useAntecedents(patientId)
  const [formulaire, setFormulaire] = useState(null) // null | { initial }
  const [retrait, setRetrait] = useState(null)
  const [envoiRetrait, setEnvoiRetrait] = useState(false)
  const [echecRetrait, setEchecRetrait] = useState(null)

  const relire = () => queryClient.invalidateQueries({ queryKey: cles.antecedents(patientId) })

  if (requete.isPending) return <Skeleton forme="bloc" hauteur="6rem" />
  if (requete.error) {
    return (
      <Message ton="erreur" action={<Button onClick={() => requete.refetch()}>Réessayer</Button>}>
        <p>{requete.error.message}</p>
      </Message>
    )
  }
  const liste = requete.data ?? []

  async function enregistrer(valeur) {
    await enregistrerAntecedent(patientId, valeur, consultationId)
    await relire()
  }

  async function retirer() {
    setEnvoiRetrait(true)
    setEchecRetrait(null)
    try {
      await retirerAntecedent(retrait.id)
      await relire()
      toast.succes('Antécédent retiré')
      setRetrait(null)
    } catch (e) {
      setEchecRetrait(e.message)
    } finally {
      setEnvoiRetrait(false)
    }
  }

  return (
    <div className="antecedents">
      {ecrire && !formulaire && (
        <div>
          <Button
            variante="secondaire"
            iconeDebut={<Icone icone={Plus} />}
            onClick={() => setFormulaire({})}
          >
            Nouvel antécédent
          </Button>
        </div>
      )}
      {formulaire && !formulaire.initial && (
        <FormulaireAntecedent
          habilite={habilite}
          sensibleParDefaut={sensibleParDefaut}
          onEnregistrer={enregistrer}
          onFermer={() => setFormulaire(null)}
        />
      )}
      {CATEGORIES.map((c) => {
        const items = liste.filter((a) => a.category === c.code)
        return (
          <section key={c.code} className="antecedents__categorie" aria-label={c.libelle}>
            <h3 className="antecedents__titre">{c.libelle}</h3>
            {items.length === 0 ? (
              <p className="antecedents__vide">Aucun noté</p>
            ) : (
              <ul className="antecedents__liste">
                {items.map((a) =>
                  formulaire?.initial?.id === a.id ? (
                    <li key={a.id}>
                      <FormulaireAntecedent
                        initial={formulaire.initial}
                        habilite={habilite}
                        onEnregistrer={enregistrer}
                        onFermer={() => setFormulaire(null)}
                      />
                    </li>
                  ) : (
                    <li key={a.id} className="antecedents__ligne">
                      <p className="antecedents__libelle">
                        <span>{a.label}</span>
                        {a.since_year && (
                          <span className="antecedents__annee">depuis {a.since_year}</span>
                        )}
                        {a.is_sensitive && <Tampon ton="alerte">Sensible</Tampon>}
                      </p>
                      {a.details && <p className="antecedents__details">{a.details}</p>}
                      {ecrire && (
                        <p className="antecedents__actions">
                          <Button
                            variante="discret"
                            iconeDebut={<Icone icone={Pencil} />}
                            disabled={!enLigne}
                            aria-label={`Modifier : ${a.label}`}
                            onClick={() => setFormulaire({ initial: saisieAntecedent(a) })}
                          >
                            Modifier
                          </Button>
                          <Button
                            variante="discret"
                            iconeDebut={<Icone icone={Undo2} />}
                            disabled={!enLigne}
                            aria-label={`Retirer : ${a.label}`}
                            onClick={() => setRetrait(a)}
                          >
                            Retirer
                          </Button>
                        </p>
                      )}
                    </li>
                  ),
                )}
              </ul>
            )}
          </section>
        )
      })}
      <Modal
        ouvert={Boolean(retrait)}
        onFermer={() => {
          setRetrait(null)
          setEchecRetrait(null)
        }}
        titre="Retirer cet antécédent ?"
        actions={
          <>
            <Button variante="secondaire" onClick={() => setRetrait(null)} disabled={envoiRetrait}>
              Garder
            </Button>
            <Button chargement={envoiRetrait} disabled={!enLigne} onClick={retirer}>
              Retirer
            </Button>
          </>
        }
      >
        <p>
          {retrait?.label} ne sera plus affiché dans le dossier. Il n’est jamais effacé : le journal
          du dossier le garde.
        </p>
        {echecRetrait && (
          <Message ton="erreur" titre="Antécédent non retiré">
            <p>{echecRetrait}</p>
          </Message>
        )}
      </Modal>
    </div>
  )
}
