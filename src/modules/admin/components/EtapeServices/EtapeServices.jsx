import { useQuery } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import Button from '../../../../components/ui/Button/Button.jsx'
import Field from '../../../../components/ui/Field/Field.jsx'
import Icone from '../../../../components/ui/Icone/Icone.jsx'
import Input from '../../../../components/ui/Input/Input.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import { useBrouillon } from '../../../../hooks/useBrouillon.js'
import { chargerModelesServices, chargerServices, cles, enregistrerServices } from '../../api.js'
import { CATEGORIES_SERVICES, memeTexte, nouvelId, pluriel } from '../../utils.js'
import ChargementEtape from '../ChargementEtape/ChargementEtape.jsx'
import EtapeCadre from '../EtapeCadre/EtapeCadre.jsx'
import LigneService from '../LigneService/LigneService.jsx'
import './EtapeServices.css'

// Écran 3 : services et tarifs. La liste de départ vient de la base (service_templates),
// selon le type de structure. AUCUN tarif n'est proposé : la structure saisit les siens.
export default function EtapeServices(props) {
  const { id: orgId, type } = props.structure
  const modeles = useQuery({
    queryKey: cles.modelesServices(type),
    queryFn: () => chargerModelesServices(type),
    staleTime: 60 * 60 * 1000,
  })
  const services = useQuery({
    queryKey: cles.services(orgId),
    queryFn: () => chargerServices(orgId),
  })
  if (!modeles.data || !services.data) {
    const erreur = modeles.error ?? services.error
    return (
      <ChargementEtape
        erreur={erreur}
        onReessayer={() => (modeles.error ? modeles.refetch() : services.refetch())}
      />
    )
  }
  return (
    <Formulaire
      {...props}
      modeles={modeles.data}
      services={services.data}
      onEnregistre={services.refetch}
    />
  )
}

// Première visite : tous les services proposés sont cochés. Ensuite : ceux déjà enregistrés,
// plus les services proposés absents, décochés.
function construireLignes(modeles, services) {
  const premiere = services.length === 0
  const presents = new Set(services.map((s) => s.template_code).filter(Boolean))
  return [
    ...services.map((s) => ({ ...s, propose: s.is_active, enregistre: true })),
    ...modeles
      .filter((m) => !presents.has(m.code))
      .map((m) => ({
        id: nouvelId(),
        template_code: m.code,
        label: m.label,
        category: m.category,
        price: null,
        sort_order: m.sort_order,
        propose: premiere,
        enregistre: false,
      })),
  ]
}

function Formulaire({ structure, modeles, services, onEnregistre, ...etape }) {
  const [initiale] = useState(() => ({ lignes: construireLignes(modeles, services), retires: [] }))
  const brouillon = useBrouillon(`demarrage.${structure.id}.services`, initiale)
  const { lignes, retires } = brouillon.valeur
  const [nouveau, setNouveau] = useState('')
  const [erreurs, setErreurs] = useState({})
  const [envoi, setEnvoi] = useState(false)
  const [erreurEnvoi, setErreurEnvoi] = useState(null)

  const modifier = (fn) => brouillon.setValeur((v) => ({ ...v, ...fn(v) }))
  const proposes = lignes.filter((l) => l.propose)
  const sansTarif = proposes.filter((l) => l.price === null).length

  function majLigne(id, champ, valeur) {
    modifier((v) => ({
      lignes: v.lignes.map((l) => (l.id === id ? { ...l, [champ]: valeur } : l)),
    }))
    setErreurs({})
  }

  function retirer(ligne) {
    modifier((v) => ({
      lignes: v.lignes.filter((l) => l.id !== ligne.id),
      retires: ligne.enregistre ? [...v.retires, ligne.id] : v.retires,
    }))
  }

  function ajouter() {
    const label = nouveau.trim()
    if (label.length < 2) return setErreurs({ nouveau: 'Saisissez le nom du service.' })
    if (label.length > 120)
      return setErreurs({ nouveau: 'Nom trop long (120 caractères au plus).' })
    if (lignes.some((l) => memeTexte(l.label, label)))
      return setErreurs({ nouveau: 'Ce service est déjà dans la liste.' })
    const ordre = Math.max(0, ...lignes.map((l) => l.sort_order)) + 10
    modifier((v) => ({
      lignes: [
        ...v.lignes,
        {
          id: nouvelId(),
          template_code: null,
          label,
          category: 'autre',
          price: null,
          sort_order: ordre,
          propose: true,
          enregistre: false,
        },
      ],
    }))
    setNouveau('')
    setErreurs({})
  }

  async function surEnvoyer() {
    if (proposes.length === 0) {
      setErreurs({ liste: 'Cochez au moins un service proposé par votre structure.' })
      return
    }
    const envois = [
      ...retires.map((id) => ({ id, removed: true })),
      ...lignes
        .filter((l) => l.enregistre || l.propose)
        .map((l) => ({
          id: l.id,
          template_code: l.template_code,
          label: l.label,
          category: l.category,
          price: l.price,
          sort_order: l.sort_order,
          is_active: l.propose,
        })),
    ]
    setEnvoi(true)
    setErreurEnvoi(null)
    try {
      await enregistrerServices(structure.id, envois)
      await etape.enregistrer()
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
      titre="Services et tarifs"
      pourquoi="La caisse et les tickets reprennent ces tarifs : plus besoin de les retenir ni de les recalculer."
      brouillon={brouillon}
      erreur={erreurEnvoi}
      envoi={envoi}
      onEnvoyer={surEnvoyer}
      onPasser={etape.passer}
      onPrecedent={etape.precedent}
    >
      <Message ton="info">
        <p>
          Décochez ce que vous ne proposez pas, puis saisissez vos tarifs. Aucun montant n’est
          proposé à l’avance : un tarif laissé vide pourra être saisi plus tard.
        </p>
      </Message>

      {CATEGORIES_SERVICES.map((categorie) => {
        const groupe = lignes.filter((l) => l.category === categorie.code)
        if (groupe.length === 0) return null
        return (
          <section key={categorie.code} className="etape-services__groupe">
            <h3 className="etape-services__categorie">{categorie.libelle}</h3>
            <ul className="etape-services__liste">
              {groupe.map((ligne) => (
                <LigneService
                  key={ligne.id}
                  ligne={ligne}
                  onChange={(champ, valeur) => majLigne(ligne.id, champ, valeur)}
                  onRetirer={() => retirer(ligne)}
                />
              ))}
            </ul>
          </section>
        )
      })}

      <div className="etape-services__ajout">
        <Field id="service-nouveau" label="Ajouter un autre service" erreur={erreurs.nouveau}>
          <Input
            value={nouveau}
            maxLength={120}
            onChange={(e) => setNouveau(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                ajouter()
              }
            }}
          />
        </Field>
        <Button variante="secondaire" iconeDebut={<Icone icone={Plus} />} onClick={ajouter}>
          Ajouter
        </Button>
      </div>

      <p className="etape-services__bilan" aria-live="polite">
        {pluriel(proposes.length, 'service proposé', 'services proposés')}
        {sansTarif > 0 && `, dont ${sansTarif} sans tarif pour l’instant`}.
      </p>
      {erreurs.liste && <Message ton="erreur">{erreurs.liste}</Message>}
    </EtapeCadre>
  )
}
