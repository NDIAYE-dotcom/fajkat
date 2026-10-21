import { useState } from 'react'
import Field from '../../../../components/ui/Field/Field.jsx'
import Input from '../../../../components/ui/Input/Input.jsx'
import { useEnLigne } from '../../../../hooks/useEnLigne.js'
import { formatTelephone } from '../../../../lib/format.js'
import EtapeCadre from '../../../admin/components/EtapeCadre/EtapeCadre.jsx'
import ListeReglages, {
  BoutonsReglage,
  LigneReglage,
} from '../../../rendez-vous/components/ListeReglages/ListeReglages.jsx'
import PanneauReglages, {
  BlocNouveau,
} from '../../../rendez-vous/components/PanneauReglages/PanneauReglages.jsx'
import { useActionReglage } from '../../../rendez-vous/hooks/useActionReglage.js'
import { cles, enregistrerDestination } from '../../api.js'
import { useDestinations } from '../../hooks/useDocuments.js'
import { TYPES_ETABLISSEMENT } from '../../documents.js'
import FormulaireDestination from '../FormulaireDestination/FormulaireDestination.jsx'
import './ReglagesReferences.css'

// Paramètres → Références (owner et admin) : délai après lequel une référence sans retour
// est signalée en retard, et établissements de destination (retirés, jamais effacés).
// Le délai réglé vit dans organizations.settings.referral_return_days ; sans réglage, la
// base applique son délai par défaut (referral_return_days), affiché dans la page
// Références. Le front n'a aucune valeur à lui.
export default function ReglagesReferences({ structure, enregistrer, suivant }) {
  const enLigne = useEnLigne()
  const [delai, setDelai] = useState(() =>
    structure.settings?.referral_return_days != null
      ? String(structure.settings.referral_return_days)
      : '',
  )
  const [erreurDelai, setErreurDelai] = useState(null)
  const [erreur, setErreur] = useState(null)
  const [envoi, setEnvoi] = useState(false)
  const destinations = useDestinations(structure.id)
  const { agir, occupe, erreur: erreurListe } = useActionReglage(cles.destinations(structure.id))
  const [edition, setEdition] = useState(null) // id, ou 'nouveau'

  async function envoyer() {
    const texte = delai.trim()
    const n = Number(texte)
    // Case vide : réglage retiré, le délai par défaut de la base s'applique.
    if (texte && (!/^\d{1,3}$/.test(texte) || n < 1 || n > 365)) {
      setErreurDelai('Tapez un nombre de jours, de 1 à 365, ou laissez vide.')
      return
    }
    setErreurDelai(null)
    setEnvoi(true)
    setErreur(null)
    try {
      await enregistrer({ referral_return_days: texte ? n : null })
      await suivant()
    } catch (e) {
      setErreur(e.message)
    } finally {
      setEnvoi(false)
    }
  }

  async function sauver(cle, champs) {
    const { ok } = await agir(cle, () => enregistrerDestination(structure.id, champs))
    if (ok) setEdition(null)
  }

  const typeDe = (code) => TYPES_ETABLISSEMENT.find((t) => t.valeur === code)?.libelle

  return (
    <div className="reglages-references">
      <EtapeCadre
        edition
        titre="Références"
        pourquoi="Une référence sans contre-référence après ce délai est signalée « En retard » dans la page Références."
        erreur={erreur}
        envoi={envoi}
        onEnvoyer={envoyer}
      >
        <Field
          label="Délai de retour attendu"
          erreur={erreurDelai}
          facultatif
          aide="Laissez vide pour garder le délai par défaut. La page Références indique le délai appliqué."
        >
          <Input
            inputMode="numeric"
            suffixe="jours"
            maxLength={3}
            value={delai}
            onChange={(e) => setDelai(e.target.value)}
          />
        </Field>
      </EtapeCadre>

      <PanneauReglages
        intro="Établissements proposés dans la lettre de référence. Un établissement retiré n’est plus proposé ; les lettres déjà émises gardent son nom."
        erreur={erreurListe}
        requetes={[destinations]}
      >
        <ListeReglages titre="Établissements de référence">
          {(destinations.data ?? []).map((d) =>
            edition === d.id ? (
              <LigneReglage key={d.id}>
                <FormulaireDestination
                  destination={d}
                  envoi={occupe === d.id}
                  onAnnuler={() => setEdition(null)}
                  onEnregistrer={(champs) =>
                    sauver(d.id, { ...champs, id: d.id, is_active: d.is_active })
                  }
                />
              </LigneReglage>
            ) : (
              <LigneReglage
                key={d.id}
                retire={!d.is_active}
                texte={`${d.name}${d.is_active ? '' : ' (retiré)'}`}
                detail={[typeDe(d.kind), formatTelephone(d.phone), d.address]
                  .filter(Boolean)
                  .join(' · ')}
                boutons={
                  <BoutonsReglage
                    id={d.id}
                    actif={d.is_active}
                    occupe={occupe}
                    enLigne={enLigne}
                    onModifier={() => setEdition(d.id)}
                    onBasculer={(cle) =>
                      agir(cle, () =>
                        enregistrerDestination(structure.id, { ...d, is_active: !d.is_active }),
                      )
                    }
                  />
                }
              />
            ),
          )}
        </ListeReglages>
        <BlocNouveau
          titre="Nouvel établissement"
          libelleBouton="Ajouter un établissement"
          ouvert={edition === 'nouveau'}
          onOuvrir={() => setEdition('nouveau')}
          desactive={!enLigne || occupe !== null}
        >
          <FormulaireDestination
            destination={null}
            envoi={occupe === 'nouveau'}
            onAnnuler={() => setEdition(null)}
            onEnregistrer={(champs) => sauver('nouveau', champs)}
          />
        </BlocNouveau>
      </PanneauReglages>
    </div>
  )
}
