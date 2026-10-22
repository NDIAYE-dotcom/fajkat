// Bilan des CPN (sans affichage ni dépendance, testé hors navigateur) : copie de
// anc_status_compute, la base fait foi. Mêmes cas de test des deux côtés :
// test.cas de supabase/tests/etape15b2.sql, lu aussi par e2e/maternite-bilan.spec.js.

// Date AAAA-MM-JJ décalée de n jours (calcul en UTC, sans fuseau).
function decaler(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

// Bilan des contacts d'une grossesse en cours. Une CPN couvre le contact
// dont la fenêtre contient son âge gestationnel ; plusieurs CPN dans une fenêtre ne couvrent
// qu'un contact ; une CPN hors de toute fenêtre ne couvre rien.
//   contacts : contacts du modèle ; gaVisites : âge gestationnel de chaque CPN (jours) ;
//   gaJour : terme du jour. Renvoie { etats, covered, expected, missed, next }.
export function bilanContacts(contacts, gaVisites, gaJour) {
  const etats = [...(contacts ?? [])]
    .sort((a, b) => a.contact_number - b.contact_number)
    .map((c) => {
      const couvert = (gaVisites ?? []).some(
        (ga) => ga >= c.window_start_days && ga <= c.window_end_days,
      )
      let state = 'upcoming'
      if (couvert) state = 'covered'
      else if (c.window_end_days < gaJour) state = 'missed'
      else if (c.window_start_days <= gaJour) state = 'current'
      return { ...c, state }
    })
  return {
    etats,
    covered: etats.filter((c) => c.state === 'covered').length,
    expected: etats.filter((c) => c.window_end_days < gaJour).length,
    missed: etats.filter((c) => c.state === 'missed').length,
    next: etats.find((c) => c.state === 'current' || c.state === 'upcoming') ?? null,
  }
}

// Prochaine CPN attendue si la CPN en cours de saisie (brouillon, pas encore comptée par la
// base) est validée aujourd'hui : même règle que anc_status_compute, la CPN du brouillon
// couvrant le contact de la fenêtre du jour.
//   status : anc_status ; contacts : contacts du modèle de la grossesse ; gaJours : terme
//   du jour ; aujourdhui : AAAA-MM-JJ. Renvoie la forme de status.next, ou null.
export function prochaineApresBrouillon(status, contacts, gaJours, aujourdhui) {
  if (!status || status.ga_days === null || status.ga_days === undefined) return null
  const faites = status.done + 1
  const { next: c } = bilanContacts(contacts, [...(status.visit_ga_days ?? []), gaJours], gaJours)
  if (!c) return null
  const date = (jours) => decaler(aujourdhui, jours - gaJours)
  const cible = date(c.target_ga_days)
  return {
    contact_number: c.contact_number,
    anc_number: faites + 1,
    target_ga_days: c.target_ga_days,
    target_date: cible > aujourdhui ? cible : aujourdhui,
    window_start_date: date(c.window_start_days),
    window_end_date: date(c.window_end_days),
  }
}
