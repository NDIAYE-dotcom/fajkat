// Rendez-vous d'un jour passé (étape 14, partie D, suite), sur le serveur et la base
// locaux. Données : e2e/donnees.sql (patients « PASSE … », rendez-vous d'hier encore
// « prévus »).
//   - accueil : l'agenda d'hier clôt les rendez-vous ; « Venu (automatique) » et « Non venu
//     (automatique) » ; le rendez-vous de PF reste « Consultation », avec le même statut ;
//     onglet Rendez-vous de la fiche ; 360 et 1440 px ;
//   - infirmier : vrai type et même statut dans la chronologie ;
//   - base : statuts, marque automatique, passage relié.
import { expect, test } from '@playwright/test'
import { COMPTES } from './comptes.js'
import { connecter, lireBase, surveillerConsole, verifierEcran } from './outils.js'

const CAPTURES = new URL('./captures/', import.meta.url).pathname

const hier = () =>
  lireBase(`select public.org_local_date(id) - 1 from public.organizations
             where name = 'Poste de santé Test'`)
const patient = (prenom) =>
  lireBase(`select id from public.patients where last_name = 'PASSE' and first_name = '${prenom}'`)

for (const largeur of [360, 1440]) {
  test(`agenda d’hier — accueil — ${largeur} px`, async ({ page }) => {
    await page.setViewportSize({ width: largeur, height: 900 })
    const erreurs = surveillerConsole(page)
    await connecter(page, COMPTES.accueil)
    await page.goto(`/app/rendez-vous?vue=liste&date=${hier()}`)
    const ligne = (prenom) => page.locator('tr, li', { hasText: `PASSE ${prenom}` }).first()
    await expect(ligne('Venue')).toContainText('Venu (automatique)')
    await expect(ligne('Absente')).toContainText('Non venu (automatique)')
    await expect(ligne('Ndeye')).toContainText('Non venu (automatique)')
    await expect(ligne('Ndeye')).toContainText('Consultation')
    await expect(page.getByText('Planification familiale')).toHaveCount(0)
    await verifierEcran(page, 'rdv-passes-agenda')
    await ligne('Ndeye').screenshot({ path: `${CAPTURES}rdv-passes-ligne-${largeur}.png` })

    await page.goto(`/app/patients/${patient('Ndeye')}?onglet=rendez-vous`)
    await expect(page.getByText('Non venu (automatique)')).toBeVisible()
    await expect(page.getByText('Planification familiale')).toHaveCount(0)
    await verifierEcran(page, 'rdv-passes-fiche')
    expect(erreurs).toEqual([])
  })
}

test('chronologie — infirmier, et base', async ({ page }) => {
  const erreurs = surveillerConsole(page)
  await connecter(page, COMPTES.infirmier)
  await page.goto(`/app/patients/${patient('Ndeye')}?onglet=chronologie`)
  const rdv = page.locator('li', { hasText: 'Planification familiale' }).first()
  await expect(rdv).toContainText('Non venu (automatique)')
  await page.goto(`/app/patients/${patient('Venue')}?onglet=chronologie`)
  await expect(page.getByText('Venu (automatique)')).toBeVisible()
  expect(
    lireBase(`select string_agg(p.first_name || ':' || a.status || ':' || a.closed_automatically
                || ':' || (a.visit_id is not null), ',' order by p.first_name)
                from public.appointments a join public.patients p on p.id = a.patient_id
               where p.last_name = 'PASSE'`),
  ).toBe('Absente:no_show:true:false,Ndeye:no_show:true:false,Venue:arrived:true:true')
  expect(erreurs).toEqual([])
})
