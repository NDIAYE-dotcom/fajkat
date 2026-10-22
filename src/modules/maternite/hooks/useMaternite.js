import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useFeature } from '../../../hooks/useFeature.js'
import { useOuverture } from '../../consultations/hooks/useConsultation.js'
import { lignesBloquees, situationsCochees } from '../soins.js'
import {
  chargerBilanCpn,
  chargerCpnConsultation,
  chargerExamensGrossesse,
  chargerSoinsConsultation,
  chargerSoinsGrossesse,
  chargerTypesSoins,
  chargerGrossesse,
  chargerModelesCpn,
  chargerOptionsCpn,
  chargerPermissions,
  chargerReglages,
  cles,
  listerCpn,
  listerGrossessesEnCours,
  listerGrossessesPatiente,
} from '../api.js'

// Droits sur la maternité. Tant qu'ils ne sont pas chargés (ou sans la feature), tout vaut
// false : un bouton non confirmé n'apparaît pas.
export function usePermissionsMaternite(orgId) {
  const incluse = useFeature('maternite').actif
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
    configurer: Boolean(d.configure),
    chargement: incluse && Boolean(orgId) && requete.isPending,
    erreur: requete.error,
  }
}

export function useReglagesMaternite(orgId, actif = true) {
  return useQuery({
    queryKey: cles.reglages(orgId),
    queryFn: () => chargerReglages(orgId),
    enabled: Boolean(orgId) && actif,
    staleTime: 10 * 60 * 1000,
  })
}

// Données cliniques : rien n'est gardé en mémoire après la sortie de l'écran.
export function useGrossessesPatiente(patientId, actif) {
  return useQuery({
    queryKey: cles.grossessesPatiente(patientId),
    queryFn: () => listerGrossessesPatiente(patientId),
    enabled: Boolean(patientId) && actif,
    gcTime: 0,
  })
}

export function useGrossesse(id) {
  return useQuery({
    queryKey: cles.grossesse(id),
    queryFn: () => chargerGrossesse(id),
    enabled: Boolean(id),
    gcTime: 0,
  })
}

export function useGrossessesEnCours(orgId, texte, page, actif) {
  return useQuery({
    queryKey: cles.enCours(orgId, texte, page),
    queryFn: () => listerGrossessesEnCours(orgId, texte, page),
    enabled: Boolean(orgId) && actif,
    placeholderData: keepPreviousData,
    gcTime: 0,
  })
}

// --- CPN ---------------------------------------------------------------------------------

export function useModelesCpn(actif = true) {
  return useQuery({
    queryKey: cles.modelesCpn(),
    queryFn: chargerModelesCpn,
    enabled: actif,
    staleTime: 60 * 60 * 1000,
  })
}

export function useOptionsCpn(orgId, actif = true) {
  return useQuery({
    queryKey: cles.optionsCpn(orgId),
    queryFn: () => chargerOptionsCpn(orgId),
    enabled: Boolean(orgId) && actif,
    staleTime: 10 * 60 * 1000,
  })
}

export function useCpnConsultation(consultationId, actif) {
  return useQuery({
    queryKey: cles.cpnConsultation(consultationId),
    queryFn: () => chargerCpnConsultation(consultationId),
    enabled: Boolean(consultationId) && actif,
    gcTime: 0,
  })
}

export function useCpn(grossesseId) {
  return useQuery({
    queryKey: cles.cpn(grossesseId),
    queryFn: () => listerCpn(grossesseId),
    enabled: Boolean(grossesseId),
    gcTime: 0,
  })
}

export function useBilanCpn(grossesseId) {
  return useQuery({
    queryKey: cles.bilanCpn(grossesseId),
    queryFn: () => chargerBilanCpn(grossesseId),
    enabled: Boolean(grossesseId),
    gcTime: 0,
  })
}

// --- Soins, Td, examens (partie B2) -------------------------------------------------------

export function useSoinsConsultation(consultationId, actif) {
  return useQuery({
    queryKey: cles.soinsConsultation(consultationId),
    queryFn: () => chargerSoinsConsultation(consultationId),
    enabled: Boolean(consultationId) && actif,
    gcTime: 0,
  })
}

export function useTypesSoins(orgId, actif = true) {
  return useQuery({
    queryKey: cles.typesSoins(orgId),
    queryFn: () => chargerTypesSoins(orgId),
    enabled: Boolean(orgId) && actif,
    staleTime: 10 * 60 * 1000,
  })
}

export function useSoinsGrossesse(grossesseId) {
  return useQuery({
    queryKey: cles.soins(grossesseId),
    queryFn: () => chargerSoinsGrossesse(grossesseId),
    enabled: Boolean(grossesseId),
    gcTime: 0,
  })
}

// Habilités seulement. Le même identifiant d'ouverture tant que l'écran reste ouvert :
// les rechargements (retour sur l'onglet…) ne font pas de nouvelle ligne de journal.
export function useExamensGrossesse(grossesseId, actif) {
  const ouverture = useOuverture()
  return useQuery({
    queryKey: cles.examens(grossesseId),
    queryFn: () => chargerExamensGrossesse(grossesseId, ouverture),
    enabled: Boolean(grossesseId) && actif,
    gcTime: 0,
  })
}

// Lignes de l'ordonnance d'une consultation en brouillon qui correspondent à un soin bloqué
// par une situation (SP sous cotrimoxazole) : { [cle]: message }. Pour une CPN, les
// situations cochées dans la CPN ; pour toute autre consultation (fièvre…), celles en
// cours de la grossesse. Vide sans la feature maternité.
export function useLignesBloquees(orgId, consultationId, estCpn, maternite, ordonnance) {
  const actif = useFeature('maternite').actif
  const types = useTypesSoins(orgId, actif)
  const soins = useSoinsConsultation(consultationId, actif)
  if (!actif || !soins.data?.pregnancy_id) return {}
  const enCours = (soins.data.conditions ?? []).filter((x) => x.active).map((x) => x.code)
  return lignesBloquees(
    ordonnance,
    types.data,
    estCpn ? situationsCochees(maternite, soins.data.conditions) : enCours,
  )
}
