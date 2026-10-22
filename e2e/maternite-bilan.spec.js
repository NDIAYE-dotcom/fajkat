// Maternité, partie B2 : copie JS du bilan des CPN (bilanContacts, prochaineApresBrouillon)
// contre les cas communs écrits dans supabase/tests/etape15b2.sql (texte entre les deux
// balises $cas_communs$), joués là contre anc_status_compute. Une seule source : SQL et JS ne peuvent pas
// diverger. Sans navigateur.
import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { bilanContacts, prochaineApresBrouillon } from '../src/modules/maternite/bilan.js'

const SQL = readFileSync(new URL('../supabase/tests/etape15b2.sql', import.meta.url), 'utf8')
const CAS = JSON.parse(SQL.split('$cas_communs$')[1])

const resume = (b, visites) => ({
  covered: b.etats.filter((c) => c.state === 'covered').map((c) => c.contact_number),
  missed: b.missed,
  expected: b.expected,
  next_contact: b.next?.contact_number ?? null,
  anc_number: b.next ? visites.length + 1 : null,
})

for (const cas of CAS.cas) {
  test(cas.nom, () => {
    expect(resume(bilanContacts(CAS.contacts, cas.visites, cas.jour), cas.visites)).toEqual(
      cas.attendu,
    )
  })
}

test(CAS.datation.nom, () => {
  const d = CAS.datation
  const avant = bilanContacts(CAS.contacts, [d.visite], d.jour)
  // Datation corrigée : DDR plus tôt, chaque âge gestationnel augmente du même décalage.
  const apres = bilanContacts(CAS.contacts, [d.visite + d.decalage], d.jour + d.decalage)
  expect(resume(avant, [d.visite])).toEqual(d.avant)
  expect(resume(apres, [d.visite])).toEqual(d.apres)
})

test('CPN du brouillon : couvre le contact de la fenêtre du jour (TEST Agenda 2)', () => {
  // CPN 1 à 15 SA validée ; CPN 2 à 16 SA en cours de saisie, le 21/10/2026.
  const status = { ga_days: 112, done: 1, visit_ga_days: [105] }
  expect(prochaineApresBrouillon(status, CAS.contacts, 112, '2026-10-21')).toEqual({
    contact_number: 2,
    anc_number: 3,
    target_ga_days: 182,
    target_date: '2026-12-30',
    window_start_date: '2026-10-28',
    window_end_date: '2027-01-19',
  })
  // Après la dernière fenêtre : plus de prochaine CPN.
  expect(prochaineApresBrouillon({ ga_days: 280, done: 0 }, CAS.contacts, 280, '2026-10-21')).toBe(
    null,
  )
})
