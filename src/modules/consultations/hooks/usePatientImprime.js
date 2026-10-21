import { useQuery } from '@tanstack/react-query'
import { chargerPatient, cles as clesPatients } from '../../patients/api.js'
import { libelleAge, nomComplet, SEXES } from '../../patients/utils.js'

// Identité du patient imprimée sur un document : celle déjà chargée (patient), sinon lue.
// -> { nom, age, sexe, numero } ou null tant qu'elle n'est pas là.
export function usePatientImprime(patientId, patient, actif = true) {
  const requete = useQuery({
    queryKey: clesPatients.patient(patientId),
    queryFn: () => chargerPatient(patientId),
    enabled: Boolean(patientId) && !patient && actif,
  })
  const p = patient ?? requete.data
  return {
    identite: p
      ? {
          nom: nomComplet(p),
          age: libelleAge(p),
          sexe: SEXES.find((s) => s.valeur === p.sex)?.libelle ?? '',
          numero: p.file_number ? `Dossier ${p.file_number}` : '',
        }
      : null,
    erreur: requete.error,
    recharger: requete.refetch,
  }
}
