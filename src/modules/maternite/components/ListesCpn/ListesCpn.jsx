import { useState } from 'react'
import Field from '../../../../components/ui/Field/Field.jsx'
import Input from '../../../../components/ui/Input/Input.jsx'
import { useEnLigne } from '../../../../hooks/useEnLigne.js'
import GrilleFormulaire from '../../../rendez-vous/components/GrilleFormulaire/GrilleFormulaire.jsx'
import ListeReglages, {
  BoutonsReglage,
  LigneReglage,
} from '../../../rendez-vous/components/ListeReglages/ListeReglages.jsx'
import PanneauReglages, {
  BlocNouveau,
} from '../../../rendez-vous/components/PanneauReglages/PanneauReglages.jsx'
import { useActionReglage } from '../../../rendez-vous/hooks/useActionReglage.js'
import { ajouterOptionCpn, cles, modifierOptionCpn } from '../../api.js'
import { LISTES_CPN } from '../../cpn.js'
import { useOptionsCpn } from '../../hooks/useMaternite.js'
import './ListesCpn.css'

// Listes de la CPN (présentation, œdèmes, protéinurie, glycosurie) : renommer, retirer,
// remettre, ajouter. Jamais de suppression : une CPN garde le libellé de son jour.
// Owner, admin et sage-femme (la base refuse les autres rôles).
export default function ListesCpn({ orgId }) {
  const enLigne = useEnLigne()
  const options = useOptionsCpn(orgId)
  const { agir, occupe, erreur } = useActionReglage(cles.optionsCpn(orgId))
  const [edition, setEdition] = useState(null) // id d'un choix, ou « nouveau:<liste> »

  async function enregistrer(cle, action) {
    const { ok } = await agir(cle, action)
    if (ok) setEdition(null)
  }

  return (
    <section className="listes-cpn" aria-labelledby="listes-cpn-titre">
      <h2 id="listes-cpn-titre" className="listes-cpn__titre">
        Listes de la CPN
      </h2>
      <PanneauReglages
        intro="Choix proposés dans la section CPN de la consultation. Un changement vaut pour les CPN suivantes : les CPN déjà enregistrées gardent le libellé de leur jour."
        erreur={erreur}
        requetes={[options]}
      >
        {LISTES_CPN.map((liste) => {
          const choix = (options.data ?? []).filter((o) => o.list_code === liste.code)
          const nouveau = `nouveau:${liste.code}`
          return (
            <div key={liste.code} className="listes-cpn__liste">
              <ListeReglages titre={liste.libelle}>
                {choix.map((o) =>
                  edition === o.id ? (
                    <LigneReglage key={o.id}>
                      <FormulaireChoix
                        initial={o.label}
                        envoi={occupe === o.id}
                        libelleEnvoi="Enregistrer"
                        onAnnuler={() => setEdition(null)}
                        onEnregistrer={(label) =>
                          enregistrer(o.id, () => modifierOptionCpn(o.id, { label }))
                        }
                      />
                    </LigneReglage>
                  ) : (
                    <LigneReglage
                      key={o.id}
                      retire={!o.is_active}
                      texte={`${o.label}${o.is_active ? '' : ' (retiré)'}`}
                      boutons={
                        <BoutonsReglage
                          id={o.id}
                          actif={o.is_active}
                          occupe={occupe}
                          enLigne={enLigne}
                          onModifier={() => setEdition(o.id)}
                          onBasculer={(cle) =>
                            agir(cle, () => modifierOptionCpn(o.id, { is_active: !o.is_active }))
                          }
                        />
                      }
                    />
                  ),
                )}
              </ListeReglages>
              <BlocNouveau
                titre={`Nouveau choix : ${liste.libelle.toLowerCase()}`}
                libelleBouton={`Ajouter un choix (${liste.libelle.toLowerCase()})`}
                ouvert={edition === nouveau}
                onOuvrir={() => setEdition(nouveau)}
                desactive={!enLigne || occupe !== null}
              >
                <FormulaireChoix
                  initial=""
                  envoi={occupe === nouveau}
                  libelleEnvoi="Ajouter"
                  onAnnuler={() => setEdition(null)}
                  onEnregistrer={(label) =>
                    enregistrer(nouveau, () =>
                      ajouterOptionCpn(orgId, liste.code, label, (choix.length + 1) * 10),
                    )
                  }
                />
              </BlocNouveau>
            </div>
          )
        })}
      </PanneauReglages>
    </section>
  )
}

function FormulaireChoix({ initial, envoi, libelleEnvoi, onAnnuler, onEnregistrer }) {
  const [label, setLabel] = useState(initial)
  const [erreur, setErreur] = useState(null)
  return (
    <GrilleFormulaire
      envoi={envoi}
      libelleEnvoi={libelleEnvoi}
      onAnnuler={onAnnuler}
      onSubmit={(e) => {
        e.preventDefault()
        if (!label.trim()) {
          setErreur('Écrivez le libellé du choix.')
          return
        }
        onEnregistrer(label.trim())
      }}
    >
      <Field label="Libellé" requis erreur={erreur}>
        <Input
          maxLength={60}
          value={label}
          onChange={(e) => {
            setLabel(e.target.value)
            setErreur(null)
          }}
        />
      </Field>
    </GrilleFormulaire>
  )
}
