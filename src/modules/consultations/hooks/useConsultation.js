import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useFeature } from '../../../hooks/useFeature.js'
import {
  chargerAntecedents,
  chargerChronologie,
  chargerConsultation,
  chargerExamens,
  chargerMesBrouillons,
  chargerPermissions,
  chargerTypes,
  chercherDiagnostics,
  cles,
} from '../api.js'

// Droits sur les consultations. Tant qu'ils ne sont pas chargés (ou sans la feature),
// tout vaut false : un bouton non confirmé n'apparaît pas.
export function usePermissionsConsultation(orgId) {
  const incluse = useFeature('consultations').actif
  const requete = useQuery({
    queryKey: cles.permissions(orgId),
    queryFn: () => chargerPermissions(orgId),
    enabled: Boolean(orgId) && incluse,
    staleTime: 5 * 60 * 1000,
  })
  const d = requete.data ?? {}
  return {
    lire: Boolean(d.read),
    ecrire: Boolean(d.write),
    sensible: Boolean(d.sensitive),
    configurer: Boolean(d.configure),
    references: Boolean(d.references),
    chargement: incluse && requete.isPending,
    erreur: requete.error,
  }
}

// Identifiant d'une ouverture d'écran : la base n'enregistre qu'une lecture d'un contenu
// sensible par ouverture, quel que soit le nombre de relectures (validation, avenant,
// ajout d'un antécédent). Nouvel écran ouvert : nouvel identifiant.
function nouvelleOuverture() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  const o = globalThis.crypto.getRandomValues(new Uint8Array(16))
  o[6] = (o[6] & 0x0f) | 0x40
  o[8] = (o[8] & 0x3f) | 0x80
  const h = [...o].map((x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

export function useOuverture() {
  const [ouverture] = useState(nouvelleOuverture)
  return ouverture
}

// Contenu médical : jamais gardé en mémoire après la sortie de l'écran, jamais relu en
// arrière-plan (chaque ouverture d'une consultation sensible est journalisée).
export function useConsultation(id) {
  const ouverture = useOuverture()
  return useQuery({
    queryKey: cles.consultation(id),
    queryFn: () => chargerConsultation(id, ouverture),
    enabled: Boolean(id),
    gcTime: 0,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  })
}

export function useTypesConsultation(orgId) {
  return useQuery({
    queryKey: cles.types(orgId),
    queryFn: () => chargerTypes(orgId),
    enabled: Boolean(orgId),
    staleTime: 10 * 60 * 1000,
  })
}

export function useExamensRapides(orgId) {
  return useQuery({
    queryKey: cles.examens(orgId),
    queryFn: () => chargerExamens(orgId),
    enabled: Boolean(orgId),
    staleTime: 10 * 60 * 1000,
  })
}

// Sans texte : favoris. Les résultats précédents restent affichés pendant la frappe.
export function useRechercheDiagnostics(orgId, texte, actif = true) {
  return useQuery({
    queryKey: cles.diagnostics(orgId, texte),
    queryFn: () => chercherDiagnostics(orgId, texte),
    enabled: Boolean(orgId) && actif,
    placeholderData: keepPreviousData,
    staleTime: 60 * 1000,
  })
}

// Consultations non validées de l'utilisateur (Journée du jour, page Consultations).
export function useMesBrouillons(orgId, actif = true) {
  return useQuery({
    queryKey: cles.mesBrouillons(orgId),
    queryFn: () => chargerMesBrouillons(orgId),
    enabled: Boolean(orgId) && actif,
    staleTime: 30 * 1000,
  })
}

// Antécédents du patient (soignants) : même règle que la consultation, une lecture
// journalisée par ouverture s'il y a des antécédents sensibles ; aucune copie gardée.
export function useAntecedents(patientId, actif = true) {
  const ouverture = useOuverture()
  return useQuery({
    queryKey: cles.antecedents(patientId),
    queryFn: () => chargerAntecedents(patientId, ouverture),
    enabled: Boolean(patientId) && actif,
    gcTime: 0,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
}

// Chronologie du dossier, par pages de 20, la plus récente en haut. types : filtre (null :
// tout ce que le rôle peut voir, la base décide).
export function useChronologie(patientId, types, actif = true) {
  return useInfiniteQuery({
    queryKey: cles.chronologie(patientId, types),
    queryFn: ({ pageParam }) => chargerChronologie(patientId, types, pageParam),
    initialPageParam: null,
    getNextPageParam: (page) => page.suite,
    enabled: Boolean(patientId) && actif,
    staleTime: 30 * 1000,
  })
}
