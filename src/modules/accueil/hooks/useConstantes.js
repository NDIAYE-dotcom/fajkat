import { useQuery } from '@tanstack/react-query'
import {
  apercuAlertes,
  chargerBornes,
  chargerConstantesPassage,
  chargerSeuils,
  cles,
} from '../api.js'
import { useValeurDifferee } from '../../patients/hooks/useRecherchePatients.js'

export function useSeuils(orgId) {
  return useQuery({
    queryKey: cles.seuils(orgId),
    queryFn: () => chargerSeuils(orgId),
    enabled: Boolean(orgId),
    staleTime: 5 * 60 * 1000,
  })
}

export function useConstantesPassage(visitId) {
  return useQuery({
    queryKey: cles.constantes(visitId),
    queryFn: () => chargerConstantesPassage(visitId),
    enabled: Boolean(visitId),
  })
}

// Alertes de la saisie en cours, calculées par la base après une pause dans la frappe.
export function useApercuAlertes(patientId, valeurs) {
  const differees = useValeurDifferee(JSON.stringify(valeurs), 400)
  const vide = differees === '{}'
  const requete = useQuery({
    queryKey: ['accueil', 'apercu-alertes', patientId, differees],
    queryFn: () => apercuAlertes(patientId, JSON.parse(differees)),
    enabled: Boolean(patientId) && !vide,
    staleTime: 60 * 1000,
  })
  return vide ? [] : (requete.data ?? [])
}

// Bornes de vraisemblance : elles ne changent qu'avec une migration.
export function useBornes() {
  return useQuery({ queryKey: cles.bornes(), queryFn: chargerBornes, staleTime: Infinity })
}
