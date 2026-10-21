import { useState } from 'react'
import { useEnLigne } from '../../../../hooks/useEnLigne.js'
import ListeReglages, {
  BoutonsReglage,
  LigneReglage,
} from '../../../rendez-vous/components/ListeReglages/ListeReglages.jsx'
import PanneauReglages, {
  BlocNouveau,
} from '../../../rendez-vous/components/PanneauReglages/PanneauReglages.jsx'
import { useActionReglage } from '../../../rendez-vous/hooks/useActionReglage.js'
import { cles, enregistrerModeleCertificat } from '../../api.js'
import { useModelesCertificat } from '../../hooks/useDocuments.js'
import FormulaireModeleCertificat from '../FormulaireModeleCertificat/FormulaireModeleCertificat.jsx'

// Paramètres → Certificats (owner et admin, même s'ils n'exercent pas : aucun patient ici) :
// modèles de repos, d'aptitude, de certificat médical. Retirés, jamais effacés ; les
// certificats émis gardent leur texte.
export default function ReglagesCertificats({ structure }) {
  const enLigne = useEnLigne()
  const modeles = useModelesCertificat(structure.id)
  const { agir, occupe, erreur } = useActionReglage(cles.modelesCertificat(structure.id))
  const [edition, setEdition] = useState(null) // id, ou 'nouveau'

  async function sauver(cle, champs) {
    const { ok } = await agir(cle, () => enregistrerModeleCertificat(structure.id, champs))
    if (ok) setEdition(null)
  }

  return (
    <PanneauReglages
      intro="Le soignant choisit un modèle dans la consultation, relit le texte complété et le modifie avant d’émettre le certificat. Aucun diagnostic n’est jamais inséré."
      erreur={erreur}
      requetes={[modeles]}
    >
      <ListeReglages titre="Modèles de certificat">
        {(modeles.data ?? []).map((m) =>
          edition === m.id ? (
            <LigneReglage key={m.id}>
              <FormulaireModeleCertificat
                modele={m}
                envoi={occupe === m.id}
                onAnnuler={() => setEdition(null)}
                onEnregistrer={(champs) =>
                  sauver(m.id, { ...champs, id: m.id, is_active: m.is_active })
                }
              />
            </LigneReglage>
          ) : (
            <LigneReglage
              key={m.id}
              retire={!m.is_active}
              texte={`${m.label}${m.is_active ? '' : ' (retiré)'}`}
              detail={m.has_days ? 'Repos en jours' : null}
              boutons={
                <BoutonsReglage
                  id={m.id}
                  actif={m.is_active}
                  occupe={occupe}
                  enLigne={enLigne}
                  onModifier={() => setEdition(m.id)}
                  onBasculer={(cle) =>
                    agir(cle, () =>
                      enregistrerModeleCertificat(structure.id, { ...m, is_active: !m.is_active }),
                    )
                  }
                />
              }
            />
          ),
        )}
      </ListeReglages>
      <BlocNouveau
        titre="Nouveau modèle"
        libelleBouton="Ajouter un modèle"
        ouvert={edition === 'nouveau'}
        onOuvrir={() => setEdition('nouveau')}
        desactive={!enLigne || occupe !== null}
      >
        <FormulaireModeleCertificat
          modele={null}
          envoi={occupe === 'nouveau'}
          onAnnuler={() => setEdition(null)}
          onEnregistrer={(champs) =>
            sauver('nouveau', { ...champs, sort_order: (modeles.data?.length ?? 0) * 10 + 10 })
          }
        />
      </BlocNouveau>
    </PanneauReglages>
  )
}
