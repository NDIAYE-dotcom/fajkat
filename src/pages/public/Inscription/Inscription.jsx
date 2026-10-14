import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import AuthPage from '../../../components/layout/AuthPage/AuthPage.jsx'
import EcranAttente from '../../../components/layout/EcranAttente/EcranAttente.jsx'
import Button from '../../../components/ui/Button/Button.jsx'
import Message from '../../../components/ui/Message/Message.jsx'
import StepIndicator from '../../../components/ui/StepIndicator/StepIndicator.jsx'
import { useAuth } from '../../../hooks/useAuth.js'
import { useBrouillon } from '../../../hooks/useBrouillon.js'
import { useOrganization } from '../../../hooks/useOrganization.js'
import { inscrire } from '../../../lib/auth.js'
import { getOffre } from '../../../lib/offres.js'
import { creerStructure } from '../../../lib/structures.js'
import ConfirmationEnvoyee from './ConfirmationEnvoyee/ConfirmationEnvoyee.jsx'
import EtapeCompte from './EtapeCompte/EtapeCompte.jsx'
import EtapeStructure from './EtapeStructure/EtapeStructure.jsx'
import {
  INSCRIPTION_VIDE,
  nettoyerStructure,
  ORDRE_COMPTE,
  ORDRE_STRUCTURE,
  validerCompte,
  validerStructure,
} from './validation.js'
import './Inscription.css'

const ETAPES = ['Compte', 'Structure']

// Type de structure : ?offre= (bouton « Inscrire ma structure »), sinon le dernier choix
// fait sur la page d'accueil (fajkat.offre).
function offreInitiale(parametre) {
  if (getOffre(parametre)) return parametre
  try {
    const memorisee = localStorage.getItem('fajkat.offre')
    return getOffre(memorisee) ? memorisee : ''
  } catch {
    return ''
  }
}

// Structure gardée dans les métadonnées du compte, dont la création automatique a échoué.
function structureEnAttente(utilisateur) {
  const enAttente = utilisateur?.user_metadata?.pending_organization
  if (!enAttente) return null
  return Object.fromEntries(
    Object.keys(INSCRIPTION_VIDE.structure).map((cle) => [
      cle,
      enAttente[cle] ?? INSCRIPTION_VIDE.structure[cle],
    ]),
  )
}

function focaliser(champ) {
  document.getElementById(champ === 'type' ? 'ins-type-poste_sante' : `ins-${champ}`)?.focus()
}

export default function Inscription() {
  const { initialise } = useAuth()
  if (!initialise) return <EcranAttente integre libelle="Ouverture de votre session…" />
  return <ParcoursInscription />
}

// Monté une fois la session connue : déjà connecté (compte confirmé, sans structure),
// le parcours commence directement à l'étape « Structure ».
function ParcoursInscription() {
  const { session, utilisateur } = useAuth()
  const { structures, structureCreee } = useOrganization()
  const navigate = useNavigate()
  const [parametres] = useSearchParams()
  const connecte = Boolean(session)

  const [initiale] = useState(() => ({
    ...INSCRIPTION_VIDE,
    structure: structureEnAttente(utilisateur) ?? {
      ...INSCRIPTION_VIDE.structure,
      type: offreInitiale(parametres.get('offre')),
    },
  }))
  // Brouillon automatique (coupures de courant) : tout sauf le mot de passe.
  const brouillon = useBrouillon('inscription', initiale)
  const { compte, structure } = brouillon.valeur
  const [motDePasse, setMotDePasse] = useState('')
  const [etape, setEtape] = useState(connecte ? 1 : 0)
  const [erreurs, setErreurs] = useState({})
  const [erreurEnvoi, setErreurEnvoi] = useState(null)
  const [compteExistant, setCompteExistant] = useState(false)
  const [envoi, setEnvoi] = useState(false)
  const [envoyee, setEnvoyee] = useState(null)

  // Au changement d'étape, le focus va sur le titre de l'étape (lecteurs d'écran, clavier).
  const titreEtape = useRef(null)
  const premierRendu = useRef(true)
  useEffect(() => {
    if (premierRendu.current) premierRendu.current = false
    else titreEtape.current?.focus()
  }, [etape, envoyee])

  const maj = (partie) => (champ, valeur) => {
    brouillon.setValeur((v) => ({ ...v, [partie]: { ...v[partie], [champ]: valeur } }))
    setErreurs((precedentes) => ({ ...precedentes, [champ]: undefined }))
    if (champ === 'email') setCompteExistant(false)
  }

  function surMotDePasse(valeur) {
    setMotDePasse(valeur)
    setErreurs((precedentes) => ({ ...precedentes, motDePasse: undefined }))
  }

  function surSuivant(evenement) {
    evenement.preventDefault()
    const trouvees = validerCompte(compte, motDePasse)
    setErreurs(trouvees)
    const premiere = ORDRE_COMPTE.find((champ) => trouvees[champ])
    if (premiere) focaliser(premiere)
    else setEtape(1)
  }

  function surEnvoyer(evenement) {
    evenement.preventDefault()
    const trouvees = validerStructure(structure)
    setErreurs(trouvees)
    const premiere = ORDRE_STRUCTURE.find((champ) => trouvees[champ])
    if (premiere) focaliser(premiere)
    else envoyer()
  }

  async function envoyer() {
    setEnvoi(true)
    setErreurEnvoi(null)
    const donnees = nettoyerStructure(structure)
    try {
      if (connecte) {
        const orgId = await creerStructure(donnees)
        brouillon.effacer()
        await structureCreee(orgId)
        navigate('/app', { replace: true })
        return
      }
      const email = compte.email.trim()
      const { confirmationRequise } = await inscrire({
        nomComplet: compte.nomComplet.trim(),
        telephone: compte.telephone,
        email,
        motDePasse,
        structure: donnees,
      })
      brouillon.effacer()
      // Sans confirmation à attendre, la session est ouverte : la structure est créée
      // à l'arrivée sur /app (OrgContext).
      if (confirmationRequise) setEnvoyee({ email, nomStructure: donnees.name })
      else navigate('/app', { replace: true })
    } catch (erreur) {
      // Les erreurs qui concernent le compte ramènent à l'étape 1, sur le bon champ.
      if (erreur.code === 'user_already_exists' || erreur.code === 'email_exists') {
        setCompteExistant(true)
        setEtape(0)
      } else if (erreur.code === 'weak_password') {
        setErreurs({ motDePasse: erreur.message })
        setEtape(0)
      } else if (erreur.code === 'email_address_invalid') {
        setErreurs({ email: erreur.message })
        setEtape(0)
      } else {
        setErreurEnvoi(erreur.message)
      }
    } finally {
      setEnvoi(false)
    }
  }

  const ajout = connecte && structures.length > 0
  const titre = ajout ? 'Ajouter une structure' : 'Inscrire ma structure'
  const intro = connecte
    ? 'Votre compte est prêt. Il reste à décrire votre structure.'
    : 'Deux étapes : votre compte, puis votre structure.'

  return (
    <AuthPage
      titre={envoyee ? 'Vérifiez votre boîte e-mail' : titre}
      intro={envoyee ? null : intro}
      pied={
        connecte ? (
          ajout && (
            <p>
              <Link to="/app">Revenir à l’application</Link>
            </p>
          )
        ) : (
          <p>
            Déjà un compte ? <Link to="/connexion">Se connecter</Link>
          </p>
        )
      }
    >
      {envoyee ? (
        <ConfirmationEnvoyee email={envoyee.email} nomStructure={envoyee.nomStructure} />
      ) : (
        <>
          <StepIndicator etapes={ETAPES} courante={etape} libelle="Étapes de l’inscription" />

          {brouillon.restaure && brouillon.enregistreLe && (
            <Message ton="info">
              <p>
                Votre saisie précédente a été retrouvée{connecte ? '' : ', sauf le mot de passe'}.
              </p>
              <Button variante="discret" onClick={brouillon.effacer}>
                Repartir d’un formulaire vide
              </Button>
            </Message>
          )}

          <h2 ref={titreEtape} tabIndex={-1} className="inscription__etape">
            {etape === 0 ? 'Votre compte' : 'Votre structure'}
          </h2>

          {etape === 0 ? (
            <EtapeCompte
              compte={compte}
              motDePasse={motDePasse}
              erreurs={erreurs}
              compteExistant={compteExistant}
              onChange={maj('compte')}
              onMotDePasse={surMotDePasse}
              onSuivant={surSuivant}
            />
          ) : (
            <EtapeStructure
              structure={structure}
              erreurs={erreurs}
              erreurEnvoi={erreurEnvoi}
              envoi={envoi}
              libelleEnvoi={connecte ? 'Créer la structure' : 'Créer mon compte'}
              onChange={maj('structure')}
              onPrecedent={connecte ? null : () => setEtape(0)}
              onEnvoyer={surEnvoyer}
            />
          )}
        </>
      )}
    </AuthPage>
  )
}
