import { useState } from 'react'
import Tampon from '../../../../components/ui/Tampon/Tampon.jsx'
import { useEnLigne } from '../../../../hooks/useEnLigne.js'
import { ajouterType, cles, modifierType } from '../../api.js'
import { useActionReglage } from '../../hooks/useActionReglage.js'
import { useServicesFile, useTypesRdv } from '../../hooks/useParametresAgenda.js'
import { libelleDuree } from '../../utils.js'
import FormulaireType from '../FormulaireType/FormulaireType.jsx'
import ListeReglages, { BoutonsReglage, LigneReglage } from '../ListeReglages/ListeReglages.jsx'
import PanneauReglages, { BlocNouveau } from '../PanneauReglages/PanneauReglages.jsx'

// Types de rendez-vous : durée, discrétion, récurrence, file à l'arrivée. Retrait sans
// suppression : les rendez-vous déjà pris gardent leur type.
export default function OngletTypes({ orgId }) {
  const enLigne = useEnLigne()
  const types = useTypesRdv(orgId)
  const services = useServicesFile(orgId)
  const { agir, occupe, erreur } = useActionReglage(cles.types(orgId))
  const [edition, setEdition] = useState(null) // id, ou 'nouveau'
  const listeServices = services.data ?? []
  const nomService = (id) => listeServices.find((q) => q.id === id)?.label

  async function enregistrer(cle, action) {
    const { ok } = await agir(cle, action)
    if (ok) setEdition(null)
  }

  return (
    <PanneauReglages
      intro="La durée sert à placer les rendez-vous dans l’agenda. Un type discret n’est jamais nommé pour le patient : il lira seulement « votre rendez-vous »."
      erreur={erreur}
      requetes={[types]}
    >
      <ListeReglages titre="Types de rendez-vous">
        {(types.data ?? []).map((t) =>
          edition === t.id ? (
            <LigneReglage key={t.id}>
              <FormulaireType
                type={t}
                services={listeServices}
                envoi={occupe === t.id}
                onAnnuler={() => setEdition(null)}
                onEnregistrer={(champs) => enregistrer(t.id, () => modifierType(t.id, champs))}
              />
            </LigneReglage>
          ) : (
            <LigneReglage
              key={t.id}
              retire={!t.is_active}
              texte={
                <>
                  {t.label}
                  {t.is_discreet && <Tampon ton="encre">Discret</Tampon>}
                  {!t.is_active && ' (retiré)'}
                </>
              }
              detail={[
                libelleDuree(t.duration_minutes),
                t.recurrence_months && `tous les ${t.recurrence_months} mois`,
                nomService(t.queue_service_id) && `file : ${nomService(t.queue_service_id)}`,
              ]
                .filter(Boolean)
                .join(' · ')}
              boutons={
                <BoutonsReglage
                  id={t.id}
                  actif={t.is_active}
                  occupe={occupe}
                  enLigne={enLigne}
                  onModifier={() => setEdition(t.id)}
                  onBasculer={(cle) =>
                    agir(cle, () => modifierType(t.id, { is_active: !t.is_active }))
                  }
                />
              }
            />
          ),
        )}
      </ListeReglages>

      <BlocNouveau
        titre="Nouveau type"
        libelleBouton="Ajouter un type"
        ouvert={edition === 'nouveau'}
        onOuvrir={() => setEdition('nouveau')}
        desactive={!enLigne || occupe !== null}
      >
        <FormulaireType
          type={null}
          services={listeServices}
          envoi={occupe === 'nouveau'}
          onAnnuler={() => setEdition(null)}
          onEnregistrer={(champs) =>
            enregistrer('nouveau', () =>
              ajouterType(orgId, { ...champs, sort_order: (types.data?.length ?? 0) * 10 + 10 }),
            )
          }
        />
      </BlocNouveau>
    </PanneauReglages>
  )
}
