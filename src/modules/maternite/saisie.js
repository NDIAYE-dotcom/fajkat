// Formulaires de la maternité : ordre des cases (focus sur la première erreur) et refus de
// la base rangés sous la case concernée.

const ORDRE = ['ddr', 'examen', 'dpa', 'semaines', 'gestite', 'parite', 'vivants', 'groupe']

export function premiereErreur(erreurs) {
  return ORDRE.find((c) => erreurs[c]) ?? Object.keys(erreurs).find((c) => erreurs[c]) ?? null
}

// Case d'un message de la base, ou null (message affiché sous le formulaire).
// type : datation saisie (« lmp », « ultrasound », « clinical »).
export function erreurSousLaCase(message, type) {
  const m = String(message || '')
  if (/dernières règles/.test(m)) return 'ddr'
  if (/aujourd’hui|aujourd'hui/.test(m)) return type === 'lmp' ? 'ddr' : 'examen'
  if (/date prévue/.test(m)) return 'dpa'
  if (/âge gestationnel/i.test(m)) return 'semaines'
  if (/examen/.test(m)) return 'examen'
  if (/^Gestité/.test(m)) return 'gestite'
  if (/parité/i.test(m)) return 'parite'
  if (/^Enfants vivants/.test(m)) return 'vivants'
  if (/^Groupe sanguin/.test(m)) return 'groupe'
  return null
}
