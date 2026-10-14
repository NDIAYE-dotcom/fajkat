import { ArrowLeft, Lock } from 'lucide-react'
import { useEffect } from 'react'
import { useOrganization } from '../../../hooks/useOrganization.js'
import { getOffre } from '../../../lib/offres.js'
import { ROLES, ROLES_ABONNEMENT } from '../../../router/navigation.js'
import Button from '../../ui/Button/Button.jsx'
import EmptyState from '../../ui/EmptyState/EmptyState.jsx'
import Icone from '../../ui/Icone/Icone.jsx'
import './ModuleNonInclus.css'

// Accès direct par l'adresse à un module que la structure ou le rôle ne permet pas :
// on explique pourquoi et on propose la suite, plutôt qu'une page introuvable.
// raison : 'offre' (fonctionnalité non incluse) ou 'role' (rôle non autorisé).
// offres : offres qui incluent le module (['clinique'], ['poste_sante']…).
export default function ModuleNonInclus({ libelle, raison, offres = [] }) {
  const { structure, role } = useOrganization()

  useEffect(() => {
    document.title = `${libelle} — Fajkat`
  }, [libelle])

  const retour = (
    <Button to="/app" variante="secondaire" iconeDebut={<Icone icone={ArrowLeft} />}>
      Revenir à la journée
    </Button>
  )

  let titre
  let texte
  let action = retour

  if (raison === 'role') {
    titre = 'Accès réservé'
    texte = `Votre rôle (${ROLES[role] ?? role}) ne donne pas accès au module « ${libelle} ». Si vous en avez besoin, demandez-le au responsable de votre structure.`
  } else {
    const autre = offres.find((type) => type !== structure.type)
    const offre = getOffre(autre)
    titre = offre
      ? `Ce module fait partie de l’offre ${offre.nom}`
      : 'Ce module n’est pas inclus dans votre offre'
    if (autre === 'clinique') {
      const peutChanger = ROLES_ABONNEMENT.includes(role)
      texte = peutChanger
        ? `« ${libelle} » est inclus dans l’offre Clinique. Le passage à cette offre se fait sans perdre aucune donnée.`
        : `« ${libelle} » est inclus dans l’offre Clinique. Parlez-en au responsable de votre structure.`
      if (peutChanger) {
        action = (
          <>
            <Button to="/app/abonnement">Voir mon abonnement</Button>
            {retour}
          </>
        )
      }
    } else {
      texte = `« ${libelle} » répond aux besoins propres aux postes de santé. Votre offre ${getOffre(structure.type)?.nom ?? ''} en couvre l’équivalent.`
    }
  }

  return (
    <div className="module-non-inclus">
      <EmptyState icone={Lock} niveau={1} titre={titre} texte={texte} action={action} />
    </div>
  )
}
