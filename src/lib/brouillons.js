// Brouillons de formulaires enregistrés dans le navigateur (voir hooks/useBrouillon.js).
// Ils peuvent contenir des données de patients : effacés à la déconnexion.
// Clé : fajkat.brouillon.<utilisateur>.<structure>.<formulaire> — sur un appareil partagé,
// un compte ne retrouve jamais le brouillon d'un autre.

export const PREFIXE_BROUILLON = 'fajkat.brouillon.'

// Comptes dont la session se ferme (ou est fermée) dans cet onglet : plus aucune écriture
// de brouillon pour eux. Sans ce verrou, une page encore affichée pendant la déconnexion
// réécrirait son brouillon en se fermant, juste après le nettoyage.
const comptesFermes = new Set()

export function cleBrouillon(cle, { utilisateurId, structureId }) {
  return `${PREFIXE_BROUILLON}${utilisateurId ?? 'anonyme'}.${structureId ?? 'aucune'}.${cle}`
}

export function peutEcrireBrouillon(utilisateurId) {
  return !utilisateurId || !comptesFermes.has(utilisateurId)
}

export function effacerBrouillons() {
  try {
    const cles = []
    for (let i = 0; i < localStorage.length; i += 1) {
      const cle = localStorage.key(i)
      if (cle?.startsWith(PREFIXE_BROUILLON)) cles.push(cle)
    }
    cles.forEach((cle) => localStorage.removeItem(cle))
  } catch {
    // Stockage indisponible : il n'y a rien à effacer.
  }
}

// Début de la déconnexion (ou session fermée ailleurs) : verrou, puis nettoyage.
export function fermerBrouillons(utilisateurId) {
  if (utilisateurId) comptesFermes.add(utilisateurId)
  effacerBrouillons()
}

// Nouvelle connexion du compte : ses brouillons s'enregistrent de nouveau.
export function ouvrirBrouillons(utilisateurId) {
  comptesFermes.delete(utilisateurId)
}
