import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { cles, PAR_PAGE, rechercherPatients } from '../api.js'

// Les noms courts (Ba, Sy, Fall) sont fréquents : la recherche part dès 2 caractères.
export const LONGUEUR_MIN_RECHERCHE = 2
const DELAI_FRAPPE = 250

// Valeur recopiée après une pause dans la frappe : une requête par mot, pas par lettre.
export function useValeurDifferee(valeur, delai = DELAI_FRAPPE) {
  const [differee, setDifferee] = useState(valeur)
  useEffect(() => {
    const minuteur = setTimeout(() => setDifferee(valeur), delai)
    return () => clearTimeout(minuteur)
  }, [valeur, delai])
  return differee
}

export function requeteSuffisante(requete) {
  return requete.trim().length >= LONGUEUR_MIN_RECHERCHE
}

// Recherche paginée côté serveur. vide : 'liste' (derniers patients créés tant que la requête est trop courte) ou 'rien'.
export function useRecherchePatients(
  orgId,
  requete,
  { page = 1, parPage = PAR_PAGE, vide = 'liste', actif = true } = {},
) {
  const q = useValeurDifferee(requete.trim())
  const assez = requeteSuffisante(q)
  const lance = actif && Boolean(orgId) && (assez || vide === 'liste')
  const recherche = useQuery({
    queryKey: cles.recherche(orgId, assez ? q : '', page, parPage),
    queryFn: () => rechercherPatients(orgId, assez ? q : '', { page, parPage }),
    enabled: lance,
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000,
  })
  return {
    lignes: lance ? (recherche.data?.lignes ?? []) : [],
    total: lance ? (recherche.data?.total ?? 0) : 0,
    chargement: lance && recherche.isPending,
    // Frappe en cours ou nouvelle page demandée : l'ancienne liste reste affichée.
    enCours: lance && (recherche.isFetching || q !== requete.trim()),
    erreur: lance ? recherche.error : null,
    relancer: recherche.refetch,
    requeteLancee: assez ? q : '',
    lance,
  }
}
