import { useState } from 'react'

// Envoi d'un rendez-vous en deux temps : la base contrôle (séance pleine, jour férié…),
// puis enregistre. Un refus s'affiche avec sa raison ; une séance pleine propose les
// prochaines séances qui ont des places ; un avertissement (jour férié, pause…) se
// confirme d'un clic. La saisie n'est jamais effacée par un échec.
//   verifier()            -> { blocking, warnings }
//   enregistrer(confirmer) -> résultat
//   chercher()            -> prochaines séances (séance pleine)
// signalerPleine(message, chercher) : séance pleine affichée dès qu'elle est choisie.
export function useEnvoiRdv() {
  const [controle, setControle] = useState(null)
  const [propositions, setPropositions] = useState(null)
  const [envoi, setEnvoi] = useState(false)
  const [echec, setEchec] = useState(null)

  function reinitialiser() {
    setControle(null)
    setPropositions(null)
    setEchec(null)
  }

  async function chercherPropositions(chercher) {
    setPropositions({ chargement: true, liste: [] })
    try {
      setPropositions({ chargement: false, liste: await chercher() })
    } catch (e) {
      setPropositions({ chargement: false, liste: [], erreur: e.message })
    }
  }

  // Séance pleine choisie : signalée tout de suite, avec les prochaines séances libres.
  function signalerPleine(message, chercher) {
    setEchec(null)
    setControle({ bloquants: [{ code: 'full', message }], alertes: [] })
    chercherPropositions(chercher)
  }

  // Renvoie { resultat } si le rendez-vous est enregistré, sinon null.
  async function envoyer({ verifier, enregistrer, chercher, confirmer = false }) {
    setEnvoi(true)
    setEchec(null)
    try {
      if (!confirmer) {
        const c = await verifier()
        const bloquants = c.blocking ?? []
        const alertes = c.warnings ?? []
        if (bloquants.length || alertes.length) {
          setControle({ bloquants, alertes })
          setPropositions(null)
          if (bloquants.some((b) => b.code === 'full') && chercher) {
            await chercherPropositions(chercher)
          }
          return null
        }
      }
      const resultat = await enregistrer(confirmer)
      reinitialiser()
      return { resultat }
    } catch (e) {
      // Avertissement apparu entre le contrôle et l'envoi : à confirmer, comme les autres.
      if (e.confirmation) setControle({ bloquants: [], alertes: [{ message: e.message }] })
      else setEchec(e.message)
      return null
    } finally {
      setEnvoi(false)
    }
  }

  return {
    controle,
    propositions,
    envoi,
    echec,
    setEchec,
    envoyer,
    reinitialiser,
    signalerPleine,
  }
}
