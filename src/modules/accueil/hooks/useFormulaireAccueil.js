import { useEffect, useState } from 'react'
import { useBrouillon } from '../../../hooks/useBrouillon.js'
import { resumePatient } from '../utils.js'

// Saisie commune à l'arrivée et à la vente d'un ticket : brouillon automatique (coupures
// de courant), erreurs par champ, échec d'envoi.
// patientCree : dossier créé (ou retrouvé) pendant que la fenêtre était fermée ; il devient
// le patient de la saisie. serviceParDefaut : service de file choisi d'office (un seul
// service, ou la consultation pour un ticket), seulement si aucun n'est encore choisi.
export function useFormulaireAccueil(cle, vide, { patientCree, serviceParDefaut } = {}) {
  const brouillon = useBrouillon(cle, vide)
  const [erreurs, setErreurs] = useState({})
  const [echec, setEchec] = useState(null)
  const [envoi, setEnvoi] = useState(false)
  const setValeur = brouillon.setValeur

  useEffect(() => {
    if (patientCree) setValeur((p) => ({ ...p, patient: resumePatient(patientCree) }))
  }, [patientCree, setValeur])

  useEffect(() => {
    if (serviceParDefaut) {
      setValeur((p) => (p.serviceId ? p : { ...p, serviceId: serviceParDefaut }))
    }
  }, [serviceParDefaut, setValeur])

  function maj(champ, valeur) {
    setValeur((p) => ({ ...p, [champ]: valeur }))
    setErreurs((e) => ({ ...e, [champ]: undefined }))
    setEchec(null)
  }

  // Erreurs trouvées : affichées, et le curseur va sur le premier champ en cause.
  function bloquer(idFormulaire, trouvees, ordre) {
    setErreurs(trouvees)
    const premiere = ordre.find((c) => trouvees[c])
    if (premiere) {
      document
        .querySelector(`#${idFormulaire} [data-champ='${premiere}'] :is(input, textarea, select)`)
        ?.focus()
    }
    return Boolean(premiere)
  }

  return {
    v: brouillon.valeur,
    brouillon,
    maj,
    erreurs,
    setErreurs,
    bloquer,
    echec,
    setEchec,
    envoi,
    setEnvoi,
  }
}
