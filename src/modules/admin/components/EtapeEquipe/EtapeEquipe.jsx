import { useQuery } from '@tanstack/react-query'
import { UserPlus } from 'lucide-react'
import { useState } from 'react'
import Button from '../../../../components/ui/Button/Button.jsx'
import Checkbox from '../../../../components/ui/Checkbox/Checkbox.jsx'
import Icone from '../../../../components/ui/Icone/Icone.jsx'
import Message from '../../../../components/ui/Message/Message.jsx'
import { useBrouillon } from '../../../../hooks/useBrouillon.js'
import { estEmailValide } from '../../../../lib/motDePasse.js'
import { estTelephoneValide } from '../../../../lib/pays.js'
import { chargerInvitations, cles, enregistrerInvitations } from '../../api.js'
import { nouvelId, rolesPour } from '../../utils.js'
import ChargementEtape from '../ChargementEtape/ChargementEtape.jsx'
import EtapeCadre from '../EtapeCadre/EtapeCadre.jsx'
import LigneMembre from '../LigneMembre/LigneMembre.jsx'
import './EtapeEquipe.css'

// Écran 2 : premiers membres de l'équipe, notés « en attente ». Les invitations
// réelles (e-mail, SMS) partiront plus tard, depuis la gestion du personnel.
export default function EtapeEquipe(props) {
  const invitations = useQuery({
    queryKey: cles.invitations(props.structure.id),
    queryFn: () => chargerInvitations(props.structure.id),
  })
  if (!invitations.data) {
    return <ChargementEtape erreur={invitations.error} onReessayer={invitations.refetch} />
  }
  return <Formulaire {...props} invitations={invitations.data} onEnregistre={invitations.refetch} />
}

const ligneVide = () => ({ id: nouvelId(), full_name: '', role: '', phone: '', email: '' })

const estVide = (l) => !l.full_name.trim() && !l.role && !l.phone && !l.email.trim()

function validerLigne(l) {
  const e = {}
  if (l.full_name.trim().length < 2) e.full_name = 'Saisissez le prénom et le nom.'
  if (!l.role) e.role = 'Choisissez un rôle.'
  if (!l.phone && !l.email.trim()) e.contact = 'Indiquez un téléphone ou un e-mail.'
  if (l.phone && !estTelephoneValide(l.phone)) e.phone = 'Numéro incomplet.'
  if (l.email.trim() && !estEmailValide(l.email)) e.email = 'Adresse e-mail non valide.'
  return e
}

function Formulaire(props) {
  const { structure, onboarding, invitations, onEnregistre } = props
  const [initiale] = useState(() => ({
    seul: Boolean(onboarding.equipe_seul),
    lignes: invitations.length
      ? invitations.map((i) => ({
          ...i,
          phone: i.phone ?? '',
          email: i.email ?? '',
          enregistre: true,
        }))
      : [ligneVide()],
    retires: [],
  }))
  const brouillon = useBrouillon(`demarrage.${structure.id}.equipe`, initiale)
  const { seul, lignes, retires } = brouillon.valeur
  const [erreurs, setErreurs] = useState({})
  const [envoi, setEnvoi] = useState(false)
  const [erreurEnvoi, setErreurEnvoi] = useState(null)
  const roles = rolesPour(structure.type)

  const modifier = (fn) => brouillon.setValeur((v) => ({ ...v, ...fn(v) }))

  function majLigne(id, champ, valeur) {
    modifier((v) => ({
      lignes: v.lignes.map((l) => (l.id === id ? { ...l, [champ]: valeur } : l)),
    }))
    setErreurs((e) => ({ ...e, liste: undefined, [id]: undefined }))
  }

  function retirer(ligne) {
    modifier((v) => ({
      lignes: v.lignes.filter((l) => l.id !== ligne.id),
      retires: ligne.enregistre ? [...v.retires, ligne.id] : v.retires,
    }))
  }

  function ajouter() {
    const ligne = ligneVide()
    modifier((v) => ({ lignes: [...v.lignes, ligne] }))
    requestAnimationFrame(() => document.getElementById(`membre-${ligne.id}-full_name`)?.focus())
  }

  async function surEnvoyer() {
    const aGarder = seul ? [] : lignes.filter((l) => l.enregistre || !estVide(l))
    const trouvees = {}
    aGarder.forEach((l) => {
      const e = validerLigne(l)
      if (Object.keys(e).length) trouvees[l.id] = e
    })
    if (!seul && aGarder.length === 0) {
      trouvees.liste =
        'Ajoutez au moins une personne, ou cochez « Je travaille seul pour l’instant ».'
    }
    setErreurs(trouvees)
    if (Object.keys(trouvees).length) return

    // Travailler seul retire les personnes déjà notées.
    const retraits = seul
      ? [...retires, ...lignes.filter((l) => l.enregistre).map((l) => l.id)]
      : retires
    const envois = [
      ...retraits.map((id) => ({ id, removed: true })),
      ...aGarder.map(({ id, full_name, role, phone, email }) => ({
        id,
        full_name,
        role,
        phone,
        email,
      })),
    ]
    setEnvoi(true)
    setErreurEnvoi(null)
    try {
      if (envois.length) await enregistrerInvitations(structure.id, envois)
      await props.enregistrer({ onboarding: { equipe_seul: seul } })
      onEnregistre()
      brouillon.effacer()
      props.suivant()
    } catch (e) {
      setErreurEnvoi(e.message)
      setEnvoi(false)
    }
  }

  return (
    <EtapeCadre
      titre="Votre équipe"
      pourquoi="Chaque personne aura son propre accès, limité à ce dont elle a besoin pour son travail."
      edition={props.edition}
      brouillon={brouillon}
      erreur={erreurEnvoi}
      envoi={envoi}
      onEnvoyer={surEnvoyer}
      onPasser={props.passer}
      onPrecedent={props.precedent}
    >
      <Message ton="info">
        <p>
          Notez simplement les personnes. Aucune invitation n’est envoyée maintenant : vous les
          enverrez plus tard, depuis la gestion du personnel.
        </p>
      </Message>

      <Checkbox
        label="Je travaille seul pour l’instant"
        description="Vous pourrez ajouter votre équipe plus tard dans les paramètres."
        checked={seul}
        onChange={(e) => {
          modifier(() => ({ seul: e.target.checked }))
          setErreurs({})
        }}
      />

      {!seul && (
        <>
          <ul className="etape-equipe__liste" aria-label="Personnes de l’équipe">
            {lignes.map((ligne, index) => (
              <LigneMembre
                key={ligne.id}
                ligne={ligne}
                numero={index + 1}
                roles={roles}
                erreurs={erreurs[ligne.id]}
                onChange={(champ, valeur) => majLigne(ligne.id, champ, valeur)}
                onRetirer={() => retirer(ligne)}
              />
            ))}
          </ul>
          <Button variante="secondaire" iconeDebut={<Icone icone={UserPlus} />} onClick={ajouter}>
            Ajouter une personne
          </Button>
        </>
      )}
      {seul && lignes.some((l) => l.enregistre) && (
        <Message ton="info">
          <p>Les personnes déjà notées seront retirées de la liste d’attente.</p>
        </Message>
      )}
      {erreurs.liste && <Message ton="erreur">{erreurs.liste}</Message>}
    </EtapeCadre>
  )
}
