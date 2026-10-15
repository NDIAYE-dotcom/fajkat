import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import Button from '../../../../components/ui/Button/Button.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import Modal from '../../../../components/ui/Modal/Modal.jsx'
import Skeleton from '../../../../components/ui/Skeleton/Skeleton.jsx'
import Tampon from '../../../../components/ui/Tampon/Tampon.jsx'
import { useEnLigne } from '../../../../hooks/useEnLigne.js'
import { ajouterSeuil, cles, modifierSeuil } from '../../api.js'
import { LIBELLES_MESURES, libelleSeuil, MESURES } from '../../constantes.js'
import { useSeuils } from '../../hooks/useConstantes.js'
import FormulaireSeuil from '../FormulaireSeuil/FormulaireSeuil.jsx'
import './ModaleSeuils.css'

// Seuils d'alerte des constantes (owner et admin). Valeurs de départ proposées à la
// création de la structure : à faire relire par le responsable médical. Aucun seuil n'est
// codé ailleurs. Retrait sans suppression ; les mesures déjà prises gardent leurs alertes.
export default function ModaleSeuils({ orgId, onFermer }) {
  const queryClient = useQueryClient()
  const enLigne = useEnLigne()
  const seuils = useSeuils(orgId)
  const [edition, setEdition] = useState(null) // id, ou 'nouveau'
  const [occupe, setOccupe] = useState(null)
  const [erreur, setErreur] = useState(null)
  const liste = seuils.data ?? []

  async function agir(cle, action) {
    setOccupe(cle)
    setErreur(null)
    try {
      await action()
      await queryClient.invalidateQueries({ queryKey: cles.seuils(orgId) })
      setEdition(null)
    } catch (e) {
      setErreur(e.message)
    } finally {
      setOccupe(null)
    }
  }

  return (
    <Modal
      ouvert
      onFermer={onFermer}
      taille="large"
      titre="Seuils d’alerte des constantes"
      description="Une valeur qui atteint un seuil s’affiche en tampon pendant la saisie. Faites relire ces valeurs par le responsable médical."
      actions={
        <Button variante="secondaire" onClick={onFermer}>
          Fermer
        </Button>
      }
    >
      <div className="modale-seuils">
        {erreur && (
          <Message ton="erreur">
            <p>{erreur}</p>
          </Message>
        )}
        {seuils.error && (
          <Message
            ton="erreur"
            action={<Button onClick={() => seuils.refetch()}>Réessayer</Button>}
          >
            <p>{seuils.error.message}</p>
          </Message>
        )}
        {seuils.isPending && <Skeleton forme="bloc" hauteur="12rem" />}

        {MESURES.filter((m) => liste.some((s) => s.measure === m.cle)).map((m) => (
          <section key={m.cle} className="modale-seuils__groupe" aria-label={m.libelle}>
            <h3 className="modale-seuils__titre">{LIBELLES_MESURES[m.cle]}</h3>
            <ul className="modale-seuils__liste">
              {liste
                .filter((s) => s.measure === m.cle)
                .map((s) => (
                  <li
                    key={s.id}
                    className={`modale-seuils__ligne${s.is_active ? '' : ' modale-seuils__ligne--retire'}`}
                  >
                    {edition === s.id ? (
                      <FormulaireSeuil
                        seuil={s}
                        envoi={occupe === s.id}
                        onAnnuler={() => setEdition(null)}
                        onEnregistrer={(champs) => agir(s.id, () => modifierSeuil(s.id, champs))}
                      />
                    ) : (
                      <>
                        <span className="modale-seuils__texte">
                          <Tampon ton={s.level === 'alert' ? 'alerte' : 'encre'}>{s.label}</Tampon>
                          <span className="modale-seuils__condition">
                            {libelleSeuil(s)}
                            {!s.is_active && ' (retiré)'}
                          </span>
                        </span>
                        <span className="modale-seuils__boutons">
                          <Button
                            variante="discret"
                            disabled={!enLigne || occupe !== null}
                            onClick={() => setEdition(s.id)}
                          >
                            Modifier
                          </Button>
                          <Button
                            variante="discret"
                            chargement={occupe === `actif-${s.id}`}
                            disabled={!enLigne || (occupe !== null && occupe !== `actif-${s.id}`)}
                            onClick={() =>
                              agir(`actif-${s.id}`, () =>
                                modifierSeuil(s.id, { is_active: !s.is_active }),
                              )
                            }
                          >
                            {s.is_active ? 'Retirer' : 'Remettre'}
                          </Button>
                        </span>
                      </>
                    )}
                  </li>
                ))}
            </ul>
          </section>
        ))}

        {edition === 'nouveau' ? (
          <section className="modale-seuils__groupe" aria-label="Nouveau seuil">
            <h3 className="modale-seuils__titre">Nouveau seuil</h3>
            <FormulaireSeuil
              seuil={null}
              envoi={occupe === 'nouveau'}
              onAnnuler={() => setEdition(null)}
              onEnregistrer={(champs) => agir('nouveau', () => ajouterSeuil(orgId, champs))}
            />
          </section>
        ) : (
          <Button
            variante="secondaire"
            className="modale-seuils__ajout"
            disabled={!enLigne || occupe !== null}
            onClick={() => setEdition('nouveau')}
          >
            Ajouter un seuil
          </Button>
        )}
      </div>
    </Modal>
  )
}
