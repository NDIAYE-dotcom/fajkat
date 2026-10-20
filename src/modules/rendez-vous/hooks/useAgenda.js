import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  chargerAgenda,
  chargerFeriesPeriode,
  chargerRappels,
  chargerRdvPatient,
  chargerStatsPatient,
  cles,
} from '../api.js'

// Rendez-vous d'une période. Pendant le passage à la période suivante, l'ancienne reste
// affichée (pas d'écran vide entre deux semaines). Relu au retour sur l'onglet.
export function useAgenda(orgId, du, au) {
  return useQuery({
    queryKey: cles.agenda(orgId, du, au),
    queryFn: () => chargerAgenda(orgId, du, au),
    enabled: Boolean(orgId),
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000,
  })
}

export function useFeriesPeriode(orgId, du, au) {
  return useQuery({
    queryKey: cles.feriesPeriode(orgId, du, au),
    queryFn: () => chargerFeriesPeriode(orgId, du, au),
    enabled: Boolean(orgId),
    placeholderData: keepPreviousData,
    staleTime: 5 * 60 * 1000,
  })
}

// Rendez-vous à rappeler un jour donné (demain par défaut côté page). Relu chaque minute :
// deux personnes peuvent appeler en même temps.
export function useRappels(orgId, date, actif = true) {
  return useQuery({
    queryKey: cles.rappels(orgId, date),
    queryFn: () => chargerRappels(orgId, date),
    enabled: Boolean(orgId && date) && actif,
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  })
}

// Rendez-vous d'un patient et son taux d'absence (fiche patient). orgId : structure du
// dossier, dont les rendez-vous des jours finis sont clos avant la lecture.
export function useRdvPatient(patientId, actif = true, orgId = null) {
  return useQuery({
    queryKey: cles.rdvPatient(patientId),
    queryFn: () => chargerRdvPatient(patientId, orgId),
    enabled: Boolean(patientId) && actif,
  })
}

export function useStatsPatient(patientId, actif = true) {
  return useQuery({
    queryKey: cles.statsPatient(patientId),
    queryFn: () => chargerStatsPatient(patientId),
    enabled: Boolean(patientId) && actif,
  })
}
