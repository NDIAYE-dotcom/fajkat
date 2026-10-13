// Préférence « réduire les animations » du système : toutes les animations sont alors coupées.
export function mouvementReduit() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}
