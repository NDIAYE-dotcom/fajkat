import { useQuery } from '@tanstack/react-query'
import { CircleCheck, CircleDashed } from 'lucide-react'
import { useState } from 'react'
import Button from '../../../../components/ui/Button/Button.jsx'
import Icone from '../../../../components/ui/Icone/Icone.jsx'
import Skeleton from '../../../../components/ui/Skeleton/Skeleton.jsx'
import {
  chargerFiche,
  chargerInvitations,
  chargerServices,
  chargerTiersPayants,
  cles,
} from '../../api.js'
import { ETAPES_DEMARRAGE, pluriel } from '../../utils.js'
import EtapeCadre from '../EtapeCadre/EtapeCadre.jsx'
import './EtapeRecapitulatif.css'

function resumeIdentite(fiche) {
  if (!fiche) return null
  const remplis = [
    fiche.logo_url && 'logo',
    fiche.address && 'adresse',
    fiche.phone && 'téléphone',
    fiche.email && 'e-mail',
    fiche.authorization_number && 'numéro d’autorisation',
  ].filter(Boolean)
  return remplis.length
    ? `Renseignés : ${remplis.join(', ')}.`
    : 'Aucune information pour l’instant.'
}

function resumeEquipe(invitations, onboarding) {
  if (onboarding.equipe_seul) return 'Vous travaillez seul pour l’instant.'
  if (!invitations) return null
  if (!invitations.length) return 'Personne n’est encore noté.'
  return `${pluriel(invitations.length, 'personne notée', 'personnes notées')}, en attente d’invitation.`
}

function resumeServices(services) {
  if (!services) return null
  const actifs = services.filter((s) => s.is_active)
  if (!actifs.length) return 'Aucun service enregistré.'
  const sansTarif = actifs.filter((s) => s.price === null).length
  return `${pluriel(actifs.length, 'service', 'services')}${sansTarif ? `, dont ${sansTarif} sans tarif` : ', tous avec un tarif'}.`
}

function resumeTiers(tiers, onboarding) {
  if (onboarding.aucun_tiers_payant) return 'Aucun tiers payant pour l’instant.'
  if (!tiers) return null
  if (!tiers.length) return 'Aucun tiers payant enregistré.'
  return tiers.map((t) => t.name).join(', ') + '.'
}

const STATUTS = {
  faite: { libelle: 'Terminé', icone: CircleCheck },
  passee: { libelle: 'Passé pour l’instant', icone: CircleDashed },
  aucun: { libelle: 'À faire', icone: CircleDashed },
}

// Écran 5 : récapitulatif. « Commencer » termine l'assistant et ouvre le tableau de bord ;
// les écrans passés restent signalés sur la carte « Configuration ».
export default function EtapeRecapitulatif({
  structure,
  onboarding,
  enregistrer,
  precedent,
  aller,
  quitter,
}) {
  const orgId = structure.id
  const fiche = useQuery({ queryKey: cles.fiche(orgId), queryFn: () => chargerFiche(orgId) })
  const equipe = useQuery({
    queryKey: cles.invitations(orgId),
    queryFn: () => chargerInvitations(orgId),
  })
  const services = useQuery({
    queryKey: cles.services(orgId),
    queryFn: () => chargerServices(orgId),
  })
  const tiers = useQuery({
    queryKey: cles.tiersPayants(orgId),
    queryFn: () => chargerTiersPayants(orgId),
  })
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState(null)

  const resumes = {
    identite: resumeIdentite(fiche.data),
    equipe: resumeEquipe(equipe.data, onboarding),
    services: resumeServices(services.data),
    tiers_payants: resumeTiers(tiers.data, onboarding),
  }
  const enErreur = [fiche, equipe, services, tiers].some((q) => q.isError)

  async function surCommencer() {
    setEnvoi(true)
    setErreur(null)
    try {
      await enregistrer()
      quitter()
    } catch (e) {
      setErreur(e.message)
      setEnvoi(false)
    }
  }

  return (
    <EtapeCadre
      titre="Récapitulatif"
      pourquoi="Vérifiez vos réponses avant de commencer. Tout reste modifiable plus tard dans les paramètres."
      erreur={erreur}
      envoi={envoi}
      libelleEnvoi="Commencer"
      onEnvoyer={surCommencer}
      onPrecedent={precedent}
    >
      <ol className="etape-recapitulatif">
        {ETAPES_DEMARRAGE.filter((e) => e.code !== 'recapitulatif').map((etape) => {
          const statut = STATUTS[onboarding.etapes[etape.code] ?? 'aucun']
          const fait = onboarding.etapes[etape.code] === 'faite'
          return (
            <li
              key={etape.code}
              className={`etape-recapitulatif__ligne${fait ? ' etape-recapitulatif__ligne--faite' : ''}`}
            >
              <Icone icone={statut.icone} className="etape-recapitulatif__icone" />
              <div className="etape-recapitulatif__texte">
                <h3 className="etape-recapitulatif__titre">{etape.libelle}</h3>
                <p className="etape-recapitulatif__statut">{statut.libelle}</p>
                {resumes[etape.code] ? (
                  <p className="etape-recapitulatif__resume">{resumes[etape.code]}</p>
                ) : enErreur ? (
                  <p className="etape-recapitulatif__resume">Détail indisponible pour le moment.</p>
                ) : (
                  <Skeleton largeur="70%" />
                )}
              </div>
              <span className="etape-recapitulatif__action">
                <Button
                  variante="discret"
                  onClick={() => aller(etape.code)}
                  aria-label={`${fait ? 'Modifier' : 'Compléter'} : ${etape.libelle}`}
                >
                  {fait ? 'Modifier' : 'Compléter'}
                </Button>
              </span>
            </li>
          )
        })}
      </ol>
    </EtapeCadre>
  )
}
