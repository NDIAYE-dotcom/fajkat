import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { estTelephoneValide } from '../../../lib/pays.js'
import { chercherDoublons, cles } from '../api.js'
import { anneeNaissance } from '../utils.js'

const DUREE_CACHE = 30 * 1000

// Critères tirés de la saisie : nom et prénom obligatoires, téléphone complet seulement.
function criteresDe(saisie) {
  const nom = saisie.nom.trim()
  const prenom = saisie.prenom.trim()
  if (!nom || !prenom) return null
  return {
    nom,
    prenom,
    telephone: estTelephoneValide(saisie.telephone) ? saisie.telephone : '',
    mere: saisie.mere.trim(),
    anneeNaissance: anneeNaissance(saisie.naissance),
  }
}

const memes = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const idsDe = (liste) => liste.map((c) => c.id).join(',')

// Doublons possibles d'une saisie en cours. Les critères sont mis à jour quand on quitte
// un champ (actualiser), pas à chaque frappe. La personne peut écarter les dossiers
// proposés (« c'est une autre personne ») : l'écart vaut pour cette liste précise.
export function useDoublons(orgId, saisie, actif) {
  const queryClient = useQueryClient()
  const [criteres, setCriteres] = useState(() => criteresDe(saisie))
  const [ecartes, setEcartes] = useState('')

  const requete = useQuery({
    queryKey: cles.doublons(orgId, criteres),
    queryFn: () => chercherDoublons(orgId, criteres),
    enabled: actif && Boolean(criteres),
    staleTime: DUREE_CACHE,
  })
  const candidats = criteres ? (requete.data ?? []) : []
  const ids = idsDe(candidats)

  function actualiser() {
    const nouveaux = criteresDe(saisie)
    if (!memes(nouveaux, criteres)) setCriteres(nouveaux)
  }

  // Avant l'envoi : true si des dossiers proches n'ont pas été écartés.
  async function bloquants() {
    const actuels = criteresDe(saisie)
    if (!actuels) return false
    if (!memes(actuels, criteres)) setCriteres(actuels)
    const proches = await queryClient.fetchQuery({
      queryKey: cles.doublons(orgId, actuels),
      queryFn: () => chercherDoublons(orgId, actuels),
      staleTime: DUREE_CACHE,
    })
    return proches.length > 0 && idsDe(proches) !== ecartes
  }

  function reinitialiser() {
    setCriteres(null)
    setEcartes('')
  }

  return {
    candidats,
    confirme: ids !== '' && ecartes === ids,
    confirmer: (oui) => setEcartes(oui ? ids : ''),
    actualiser,
    bloquants,
    reinitialiser,
  }
}
