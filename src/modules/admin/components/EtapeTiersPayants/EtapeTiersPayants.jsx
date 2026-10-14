import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import Checkbox from '../../../../components/ui/Checkbox/Checkbox.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import { useBrouillon } from '../../../../hooks/useBrouillon.js'
import { chargerTiersPayants, cles, enregistrerTiersPayants } from '../../api.js'
import { FAMILLES_TIERS_PAYANTS, memeTexte, nouvelId, NOM_SEN_CSU } from '../../utils.js'
import ChampTaux from '../ChampTaux/ChampTaux.jsx'
import ChargementEtape from '../ChargementEtape/ChargementEtape.jsx'
import EtapeCadre from '../EtapeCadre/EtapeCadre.jsx'
import ListeTiersPayants from '../ListeTiersPayants/ListeTiersPayants.jsx'
import './EtapeTiersPayants.css'

// Écran 4 : tiers payants acceptés et taux de prise en charge par défaut (vides au départ).
export default function EtapeTiersPayants(props) {
  const tiers = useQuery({
    queryKey: cles.tiersPayants(props.structure.id),
    queryFn: () => chargerTiersPayants(props.structure.id),
  })
  if (!tiers.data) return <ChargementEtape erreur={tiers.error} onReessayer={tiers.refetch} />
  return <Formulaire {...props} tiers={tiers.data} onEnregistre={tiers.refetch} />
}

const estVide = (l) => !l.enregistre && !l.name.trim() && l.coverage_rate === null

function valider(lignes) {
  const erreurs = {}
  lignes.forEach((l, index) => {
    const e = {}
    if (l.kind !== 'sen_csu') {
      if (l.name.trim().length < 2) e.name = 'Saisissez le nom.'
      else if (lignes.slice(0, index).some((a) => a.kind === l.kind && memeTexte(a.name, l.name)))
        e.name = 'Ce nom est déjà dans la liste.'
    }
    if (l.coverage_rate !== null && l.coverage_rate > 100)
      e.coverage_rate = 'Le taux ne peut pas dépasser 100 %.'
    if (Object.keys(e).length) erreurs[l.id] = e
  })
  return erreurs
}

function Formulaire({ structure, onboarding, tiers, onEnregistre, ...etape }) {
  const [initiale] = useState(() => ({
    aucun: Boolean(onboarding.aucun_tiers_payant),
    lignes: tiers.map((t) => ({ ...t, enregistre: true })),
    retires: [],
  }))
  const brouillon = useBrouillon(`demarrage.${structure.id}.tiers_payants`, initiale)
  const { aucun, lignes } = brouillon.valeur
  const [erreurs, setErreurs] = useState({})
  const [envoi, setEnvoi] = useState(false)
  const [erreurEnvoi, setErreurEnvoi] = useState(null)

  const modifier = (fn) => brouillon.setValeur((v) => ({ ...v, ...fn(v) }))
  const senCsu = lignes.find((l) => l.kind === 'sen_csu')

  function majLigne(id, champ, valeur) {
    modifier((v) => ({
      lignes: v.lignes.map((l) => (l.id === id ? { ...l, [champ]: valeur } : l)),
    }))
    setErreurs({})
  }

  function ajouter(kind, name = '') {
    const ligne = { id: nouvelId(), kind, name, coverage_rate: null, enregistre: false }
    modifier((v) => ({ lignes: [...v.lignes, ligne] }))
    if (kind !== 'sen_csu') {
      requestAnimationFrame(() => document.getElementById(`tiers-${ligne.id}-name`)?.focus())
    }
  }

  function retirer(ligne) {
    modifier((v) => ({
      lignes: v.lignes.filter((l) => l.id !== ligne.id),
      retires: ligne.enregistre ? [...v.retires, ligne.id] : v.retires,
    }))
  }

  async function surEnvoyer() {
    const { retires } = brouillon.valeur
    const aGarder = aucun ? [] : lignes.filter((l) => !estVide(l))
    const trouvees = valider(aGarder)
    if (!aucun && aGarder.length === 0) {
      trouvees.liste =
        'Indiquez au moins un tiers payant, ou cochez « Nous n’acceptons aucun tiers payant pour l’instant ».'
    }
    setErreurs(trouvees)
    if (Object.keys(trouvees).length) return

    const retraits = aucun
      ? [...retires, ...lignes.filter((l) => l.enregistre).map((l) => l.id)]
      : retires
    const envois = [
      ...retraits.map((id) => ({ id, removed: true })),
      ...aGarder.map(({ id, kind, name, coverage_rate }) => ({ id, kind, name, coverage_rate })),
    ]
    setEnvoi(true)
    setErreurEnvoi(null)
    try {
      if (envois.length) await enregistrerTiersPayants(structure.id, envois)
      await etape.enregistrer({ onboarding: { aucun_tiers_payant: aucun } })
      onEnregistre()
      brouillon.effacer()
      etape.suivant()
    } catch (e) {
      setErreurEnvoi(e.message)
      setEnvoi(false)
    }
  }

  return (
    <EtapeCadre
      titre="Tiers payants acceptés"
      pourquoi="À l’encaissement, Fajkat calcule la part prise en charge et la part que paie le patient."
      brouillon={brouillon}
      erreur={erreurEnvoi}
      envoi={envoi}
      onEnvoyer={surEnvoyer}
      onPasser={etape.passer}
      onPrecedent={etape.precedent}
    >
      <Checkbox
        label="Nous n’acceptons aucun tiers payant pour l’instant"
        description="Tous les patients paient eux-mêmes. Vous pourrez changer ce choix plus tard dans les paramètres."
        checked={aucun}
        onChange={(e) => {
          modifier(() => ({ aucun: e.target.checked }))
          setErreurs({})
        }}
      />

      {!aucun && (
        <>
          <section className="etape-tiers-payants__sen-csu" aria-label="SEN-CSU">
            <Checkbox
              label="Nous acceptons la SEN-CSU"
              checked={Boolean(senCsu)}
              onChange={(e) =>
                e.target.checked ? ajouter('sen_csu', NOM_SEN_CSU) : retirer(senCsu)
              }
            />
            {senCsu && (
              <ChampTaux
                id={`tiers-${senCsu.id}-taux`}
                nom={NOM_SEN_CSU}
                value={senCsu.coverage_rate}
                erreur={erreurs[senCsu.id]?.coverage_rate}
                onChange={(valeur) => majLigne(senCsu.id, 'coverage_rate', valeur)}
              />
            )}
          </section>

          {FAMILLES_TIERS_PAYANTS.map((famille) => (
            <ListeTiersPayants
              key={famille.kind}
              famille={famille}
              lignes={lignes.filter((l) => l.kind === famille.kind)}
              erreurs={erreurs}
              onChange={majLigne}
              onAjouter={() => ajouter(famille.kind)}
              onRetirer={retirer}
            />
          ))}
        </>
      )}
      {aucun && lignes.some((l) => l.enregistre) && (
        <Message ton="info">
          <p>Les tiers payants déjà enregistrés seront retirés.</p>
        </Message>
      )}
      {erreurs.liste && <Message ton="erreur">{erreurs.liste}</Message>}
    </EtapeCadre>
  )
}
