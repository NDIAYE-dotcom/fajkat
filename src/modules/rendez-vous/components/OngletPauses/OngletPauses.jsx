import { useState } from 'react'
import { useEnLigne } from '../../../../hooks/useEnLigne.js'
import { ajouterPause, cles, modifierPause } from '../../api.js'
import { useActionReglage } from '../../hooks/useActionReglage.js'
import { usePauses } from '../../hooks/useParametresAgenda.js'
import { heureCourte, libelleJour } from '../../utils.js'
import FormulairePause from '../FormulairePause/FormulairePause.jsx'
import ListeReglages, { BoutonsReglage, LigneReglage } from '../ListeReglages/ListeReglages.jsx'
import PanneauReglages, { BlocNouveau } from '../PanneauReglages/PanneauReglages.jsx'

// Pauses : un rendez-vous pris pendant une pause demande une confirmation.
export default function OngletPauses({ orgId }) {
  const enLigne = useEnLigne()
  const pauses = usePauses(orgId)
  const { agir, occupe, erreur } = useActionReglage(cles.pauses(orgId))
  const [edition, setEdition] = useState(null)

  async function enregistrer(cle, action) {
    const { ok } = await agir(cle, action)
    if (ok) setEdition(null)
  }

  const liste = pauses.data ?? []

  return (
    <PanneauReglages
      intro="Un rendez-vous pris pendant une pause demande une confirmation. Les horaires d’ouverture se règlent dans Paramètres → Identité."
      erreur={erreur}
      requetes={[pauses]}
    >
      {liste.length === 0 && edition !== 'nouveau' ? (
        <p>Aucune pause enregistrée.</p>
      ) : (
        <ListeReglages titre="Pauses">
          {liste.map((p) =>
            edition === p.id ? (
              <LigneReglage key={p.id}>
                <FormulairePause
                  pause={p}
                  envoi={occupe === p.id}
                  onAnnuler={() => setEdition(null)}
                  onEnregistrer={(champs) => enregistrer(p.id, () => modifierPause(p.id, champs))}
                />
              </LigneReglage>
            ) : (
              <LigneReglage
                key={p.id}
                retire={!p.is_active}
                texte={`${p.label}${p.is_active ? '' : ' (retirée)'}`}
                detail={`${p.weekday ? libelleJour(p.weekday) : 'Tous les jours'} · ${heureCourte(p.start_time)} – ${heureCourte(p.end_time)}`}
                boutons={
                  <BoutonsReglage
                    id={p.id}
                    actif={p.is_active}
                    occupe={occupe}
                    enLigne={enLigne}
                    onModifier={() => setEdition(p.id)}
                    onBasculer={(cle) =>
                      agir(cle, () => modifierPause(p.id, { is_active: !p.is_active }))
                    }
                  />
                }
              />
            ),
          )}
        </ListeReglages>
      )}

      <BlocNouveau
        titre="Nouvelle pause"
        libelleBouton="Ajouter une pause"
        ouvert={edition === 'nouveau'}
        onOuvrir={() => setEdition('nouveau')}
        desactive={!enLigne || occupe !== null}
      >
        <FormulairePause
          pause={null}
          envoi={occupe === 'nouveau'}
          onAnnuler={() => setEdition(null)}
          onEnregistrer={(champs) => enregistrer('nouveau', () => ajouterPause(orgId, champs))}
        />
      </BlocNouveau>
    </PanneauReglages>
  )
}
