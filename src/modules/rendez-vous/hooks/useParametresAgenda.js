import { useQuery } from '@tanstack/react-query'
import {
  chargerJoursFeries,
  chargerMembres,
  chargerModelesFeries,
  chargerPauses,
  chargerPermissions,
  chargerRdvAReporter,
  chargerSeances,
  chargerServicesFile,
  chargerTypes,
  cles,
} from '../api.js'
import { estPraticien } from '../utils.js'

const CINQ_MINUTES = 5 * 60 * 1000

export function usePermissionsAgenda(orgId) {
  return useQuery({
    queryKey: cles.permissions(orgId),
    queryFn: () => chargerPermissions(orgId),
    enabled: Boolean(orgId),
    staleTime: CINQ_MINUTES,
  })
}

export function useTypesRdv(orgId) {
  return useQuery({
    queryKey: cles.types(orgId),
    queryFn: () => chargerTypes(orgId),
    enabled: Boolean(orgId),
    staleTime: CINQ_MINUTES,
  })
}

export function useServicesFile(orgId) {
  return useQuery({
    queryKey: cles.servicesFile(orgId),
    queryFn: () => chargerServicesFile(orgId),
    enabled: Boolean(orgId),
    staleTime: CINQ_MINUTES,
  })
}

export function useSeances(orgId) {
  return useQuery({
    queryKey: cles.seances(orgId),
    queryFn: () => chargerSeances(orgId),
    enabled: Boolean(orgId),
    staleTime: CINQ_MINUTES,
  })
}

// Praticiens possibles (offre Clinique) : membres actifs soignants, ou owner / admin soignant.
export function usePraticiens(orgId, actif) {
  return useQuery({
    queryKey: cles.praticiens(orgId),
    queryFn: () => chargerMembres(orgId),
    enabled: Boolean(orgId) && actif,
    staleTime: CINQ_MINUTES,
    select: (membres) =>
      membres.filter(estPraticien).sort((a, b) => a.nom.localeCompare(b.nom, 'fr')),
  })
}

export function usePauses(orgId) {
  return useQuery({
    queryKey: cles.pauses(orgId),
    queryFn: () => chargerPauses(orgId),
    enabled: Boolean(orgId),
    staleTime: CINQ_MINUTES,
  })
}

export function useJoursFeries(orgId, annee) {
  return useQuery({
    queryKey: cles.feries(orgId, annee),
    queryFn: () => chargerJoursFeries(orgId, annee),
    enabled: Boolean(orgId),
  })
}

export function useModelesFeries(pays) {
  return useQuery({
    queryKey: cles.modelesFeries(pays),
    queryFn: () => chargerModelesFeries(pays),
    enabled: Boolean(pays),
    staleTime: 60 * 60 * 1000,
  })
}

export function useRdvAReporter(orgId, date) {
  return useQuery({
    queryKey: cles.rdvDuJour(orgId, date),
    queryFn: () => chargerRdvAReporter(orgId, date),
    enabled: Boolean(orgId && date),
  })
}
