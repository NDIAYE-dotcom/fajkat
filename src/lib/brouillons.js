// Brouillons de formulaires enregistrés dans le navigateur (voir hooks/useBrouillon.js).
// Ils peuvent contenir des données de patients : effacés à la déconnexion.

export const PREFIXE_BROUILLON = 'fajkat.brouillon.'

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
