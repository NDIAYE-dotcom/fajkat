import { useState } from 'react'
import Button from '../../../../components/ui/Button/Button.jsx'
import Field from '../../../../components/ui/Field/Field.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import Modal from '../../../../components/ui/Modal/Modal.jsx'
import Select from '../../../../components/ui/Select/Select.jsx'
import { formatDate } from '../../../../lib/format.js'
import { modifierMembre } from '../../api.js'
import { libelleRole, rolesAttribuables } from '../../utils.js'
import './ModaleMembre.css'

// Changement de rôle, désactivation ou réactivation d'un membre. Jamais de suppression :
// ses saisies restent dans les registres. Les règles qui comptent (propriétaire, dernier
// propriétaire, son propre accès, places de l'offre) sont tenues par la base ; on les
// annonce ici pour éviter un essai inutile.
export default function ModaleMembre({ membre, moi, roleUtilisateur, type, onFermer, onModifie }) {
  const [role, setRole] = useState(membre?.role ?? '')
  const [envoi, setEnvoi] = useState(null)
  const [erreur, setErreur] = useState(null)
  if (!membre) return null

  const nom = membre.profil?.full_name || 'Ce membre'
  const estMoi = membre.user_id === moi
  const ownerProtege = membre.role === 'owner' && roleUtilisateur !== 'owner'
  const bloque = estMoi || ownerProtege
  const options = rolesAttribuables(roleUtilisateur, type)
  if (!options.some((o) => o.valeur === membre.role)) {
    options.unshift({ valeur: membre.role, libelle: libelleRole(membre.role) })
  }

  async function enregistrer(champs, quoi, succes) {
    setEnvoi(quoi)
    setErreur(null)
    try {
      await modifierMembre(membre.id, champs)
      onModifie(succes)
    } catch (e) {
      setErreur(e)
      setEnvoi(null)
    }
  }

  return (
    <Modal
      ouvert
      onFermer={onFermer}
      titre={nom}
      description={`${libelleRole(membre.role)} · arrivé(e) le ${formatDate(membre.created_at)}`}
    >
      <div className="modale-membre">
        {estMoi && (
          <Message titre="Votre propre accès">
            <p>Pour changer votre rôle ou votre accès, demandez à un autre responsable.</p>
          </Message>
        )}
        {ownerProtege && (
          <Message titre="Propriétaire de la structure">
            <p>Seul un propriétaire peut modifier l’accès d’un propriétaire.</p>
          </Message>
        )}
        {erreur && (
          <Message ton="erreur" titre="Modification refusée">
            <p>{erreur.message}</p>
          </Message>
        )}

        <Field id="modale-membre-role" label="Rôle" aide="Le rôle décide des modules visibles.">
          <Select
            value={role}
            disabled={bloque || !membre.is_active}
            options={options}
            onChange={(e) => setRole(e.target.value)}
          />
        </Field>
        <Button
          disabled={bloque || role === membre.role || !membre.is_active}
          chargement={envoi === 'role'}
          onClick={() => enregistrer({ role }, 'role', `${nom} : rôle « ${libelleRole(role)} »`)}
        >
          Enregistrer le rôle
        </Button>

        <section className="modale-membre__acces" aria-labelledby="modale-membre-acces">
          <h3 id="modale-membre-acces" className="modale-membre__titre">
            Accès à la structure
          </h3>
          {membre.is_active ? (
            <>
              <p className="modale-membre__texte">
                {nom} ne pourra plus ouvrir Fajkat pour cette structure. Ses saisies restent dans
                les registres, et vous pourrez réactiver son accès.
              </p>
              <Button
                variante="secondaire"
                className="modale-membre__desactiver"
                disabled={bloque}
                chargement={envoi === 'acces'}
                onClick={() =>
                  enregistrer({ is_active: false }, 'acces', `Accès de ${nom} désactivé`)
                }
              >
                Désactiver l’accès
              </Button>
            </>
          ) : (
            <>
              <p className="modale-membre__texte">
                Accès désactivé. En le réactivant, {nom} retrouve son rôle et utilise une place de
                votre offre.
              </p>
              <Button
                variante="secondaire"
                disabled={bloque}
                chargement={envoi === 'acces'}
                onClick={() =>
                  enregistrer({ is_active: true }, 'acces', `Accès de ${nom} réactivé`)
                }
              >
                Réactiver l’accès
              </Button>
            </>
          )}
        </section>
      </div>
    </Modal>
  )
}
