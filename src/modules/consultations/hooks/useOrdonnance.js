import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  chargerEnTeteStructure,
  chargerFormes,
  chargerVoies,
  cles,
  suggererMedicaments,
} from '../api.js'

// Référentiels de l'ordonnance : rarement modifiés, gardés une heure.
export function useFormesMedicament() {
  return useQuery({ queryKey: cles.formes(), queryFn: chargerFormes, staleTime: 60 * 60 * 1000 })
}

export function useVoies() {
  return useQuery({ queryKey: cles.voies(), queryFn: chargerVoies, staleTime: 60 * 60 * 1000 })
}

// Suggestions de noms dès 2 caractères ; les précédentes restent affichées pendant la frappe.
export function useSuggestionsMedicaments(orgId, texte, actif = true) {
  return useQuery({
    queryKey: cles.medicaments(orgId, texte),
    queryFn: () => suggererMedicaments(orgId, texte),
    enabled: Boolean(orgId) && actif && texte.length >= 2,
    placeholderData: keepPreviousData,
    staleTime: 60 * 1000,
    retry: false,
  })
}

export function useEnTeteStructure(orgId, actif = true) {
  return useQuery({
    queryKey: cles.enTeteStructure(orgId),
    queryFn: () => chargerEnTeteStructure(orgId),
    enabled: Boolean(orgId) && actif,
    staleTime: 10 * 60 * 1000,
  })
}
