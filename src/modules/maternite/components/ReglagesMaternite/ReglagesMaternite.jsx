import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import Button from '../../../../components/ui/Button/Button.jsx'
import Field from '../../../../components/ui/Field/Field.jsx'
import Input from '../../../../components/ui/Input/Input.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import Radio from '../../../../components/ui/Radio/Radio.jsx'
import Skeleton from '../../../../components/ui/Skeleton/Skeleton.jsx'
import { useEnLigne } from '../../../../hooks/useEnLigne.js'
import { formatDate } from '../../../../lib/format.js'
import EtapeCadre from '../../../admin/components/EtapeCadre/EtapeCadre.jsx'
import { cles, enregistrerReglages } from '../../api.js'
import { ciblesModele } from '../../cpn.js'
import { dpaDepuisDdr, formatSA, METHODES_DPA } from '../../grossesse.js'
import { useModelesCpn, useReglagesMaternite } from '../../hooks/useMaternite.js'
import ListesCpn from '../ListesCpn/ListesCpn.jsx'
import './ReglagesMaternite.css'

// Bornes des cases : celles des contraintes de maternity_settings (vraisemblance du réglage,
// pas une règle médicale).
const DUREE = { min: 250, max: 310 }
const MAXIMUM = { min: 280, max: 330 }
// Exemple affiché pour vérifier le réglage d'un coup d'œil.
const DDR_EXEMPLE = '2026-03-01'

const saisieDe = (r) => ({
  methode: r.edd_method,
  duree: String(r.pregnancy_length_days),
  maximum: String(r.max_gestational_days),
  modele: r.anc_model_code,
})

// Paramètres → Maternité (owner et admin) et onglet Réglages de la page Maternité (aussi la
// sage-femme) : méthode de calcul de la DPA, durée de la grossesse, âge gestationnel maximal,
// modèle de CPN ; puis les listes de la CPN. Un changement ne vaut que pour la suite : les
// datations gardent leur méthode, les grossesses en cours leur modèle de CPN.
export default function ReglagesMaternite({ structure, suivant }) {
  const reglages = useReglagesMaternite(structure.id)
  if (reglages.isPending) return <Skeleton forme="bloc" hauteur="12rem" />
  if (reglages.error || !reglages.data) {
    return (
      <Message ton="erreur" action={<Button onClick={() => reglages.refetch()}>Réessayer</Button>}>
        <p>{reglages.error?.message ?? 'Les réglages de la maternité sont introuvables.'}</p>
      </Message>
    )
  }
  return (
    <>
      <Formulaire structure={structure} initial={reglages.data} suivant={suivant} />
      <ListesCpn orgId={structure.id} />
    </>
  )
}

function Formulaire({ structure, initial, suivant }) {
  const queryClient = useQueryClient()
  const enLigne = useEnLigne()
  const [s, setS] = useState(() => saisieDe(initial))
  const [erreurs, setErreurs] = useState({})
  const [erreur, setErreur] = useState(null)
  const [envoi, setEnvoi] = useState(false)
  const modeles = useModelesCpn()

  const duree = Number(s.duree)
  const maximum = Number(s.maximum)
  const exemple =
    s.methode === 'naegele' || (Number.isInteger(duree) && duree >= DUREE.min && duree <= DUREE.max)
      ? dpaDepuisDdr(DDR_EXEMPLE, s.methode, duree)
      : null

  function maj(champ, valeur) {
    setS((p) => ({ ...p, [champ]: valeur }))
    setErreurs((e) => ({ ...e, [champ]: undefined }))
    setErreur(null)
  }

  async function envoyer() {
    const trouvees = {}
    if (!/^\d{3}$/.test(s.duree) || duree < DUREE.min || duree > DUREE.max) {
      trouvees.duree = `Tapez un nombre de jours, de ${DUREE.min} à ${DUREE.max}.`
    }
    if (!/^\d{3}$/.test(s.maximum) || maximum < MAXIMUM.min || maximum > MAXIMUM.max) {
      trouvees.maximum = `Tapez un nombre de jours, de ${MAXIMUM.min} à ${MAXIMUM.max}.`
    }
    setErreurs(trouvees)
    if (Object.keys(trouvees).length) {
      document.getElementById(`reglages-maternite-${Object.keys(trouvees)[0]}`)?.focus()
      return
    }
    setEnvoi(true)
    setErreur(null)
    try {
      await enregistrerReglages(structure.id, {
        edd_method: s.methode,
        pregnancy_length_days: duree,
        max_gestational_days: maximum,
        anc_model_code: s.modele,
      })
      await queryClient.invalidateQueries({ queryKey: cles.reglages(structure.id) })
      await suivant?.()
    } catch (e) {
      setErreur(e.message)
    } finally {
      setEnvoi(false)
    }
  }

  const chiffres = (texte) => texte.replace(/\D/g, '').slice(0, 3)

  return (
    <EtapeCadre
      edition
      titre="Maternité"
      pourquoi="Ces réglages servent à calculer la date prévue d’accouchement et le terme. Valeurs proposées d’après l’OMS, à faire valider par une sage-femme de la structure."
      erreur={erreur}
      envoi={envoi}
      onEnvoyer={envoyer}
    >
      <div className="reglages-maternite">
        <Field groupe label="Calcul de la date prévue d’accouchement depuis la DDR" requis>
          <div className="reglages-maternite__choix">
            {METHODES_DPA.map((m) => (
              <Radio
                key={m.valeur}
                name="reglages-maternite-methode"
                label={m.libelle}
                description={m.description}
                checked={s.methode === m.valeur}
                disabled={!enLigne}
                onChange={() => maj('methode', m.valeur)}
              />
            ))}
          </div>
        </Field>
        <Field
          id="reglages-maternite-duree"
          label="Durée de la grossesse"
          requis
          erreur={erreurs.duree}
          aide="Pour « DDR + durée », et pour une datation par échographie ou par estimation."
        >
          <Input
            mono
            inputMode="numeric"
            maxLength={3}
            suffixe="jours"
            value={s.duree}
            onChange={(e) => maj('duree', chiffres(e.target.value))}
          />
        </Field>
        <Field
          id="reglages-maternite-maximum"
          label="Terme maximal admis"
          requis
          erreur={erreurs.maximum}
          aide={
            Number.isInteger(maximum) && maximum > 0
              ? `${formatSA(maximum)}. Au-delà, une datation est refusée comme invraisemblable.`
              : 'Au-delà, une datation est refusée comme invraisemblable.'
          }
        >
          <Input
            mono
            inputMode="numeric"
            maxLength={3}
            suffixe="jours"
            value={s.maximum}
            onChange={(e) => maj('maximum', chiffres(e.target.value))}
          />
        </Field>
        <Field groupe label="Modèle de CPN" requis>
          <div className="reglages-maternite__choix">
            {modeles.isPending && <Skeleton forme="bloc" hauteur="4rem" />}
            {modeles.error && (
              <Message
                ton="erreur"
                action={<Button onClick={() => modeles.refetch()}>Réessayer</Button>}
              >
                <p>{modeles.error.message}</p>
              </Message>
            )}
            {(modeles.data ?? []).map((m) => (
              <Radio
                key={m.code}
                name="reglages-maternite-modele"
                label={m.label}
                description={`Contacts vers ${ciblesModele(m.contacts)}.`}
                checked={s.modele === m.code}
                disabled={!enLigne}
                onChange={() => maj('modele', m.code)}
              />
            ))}
          </div>
        </Field>
        {exemple && (
          <p className="reglages-maternite__exemple" role="status">
            Exemple : DDR le{' '}
            <span className="reglages-maternite__chiffres">{formatDate(DDR_EXEMPLE)}</span>, date
            prévue le <span className="reglages-maternite__chiffres">{formatDate(exemple)}</span>.
          </p>
        )}
        <p className="reglages-maternite__note">
          Un changement vaut pour la suite. Les datations déjà notées gardent la méthode de leur
          jour ; les grossesses en cours gardent leur modèle de CPN.
        </p>
      </div>
    </EtapeCadre>
  )
}
