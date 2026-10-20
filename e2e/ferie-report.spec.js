// Jour férié daté après coup (étape 13, partie B, vérifié en partie E) : la Tabaski est
// annoncée alors que des rendez-vous sont déjà pris ce jour-là (e2e/donnees.sql :
// « SUIVI Férié 1 » en consultation, « SUIVI Férié 2 » en PF, au premier jour ouvert à
// partir de J + 12). L'owner l'ajoute dans Paramètres de l'agenda, voit aussitôt les
// rendez-vous du jour, les reporte en un geste au jour ouvert suivant ; les anciens restent
// visibles comme « Reporté ». Dates relues dans la base : indépendant du calendrier.
import { expect, test } from '@playwright/test'
import { COMPTES } from './comptes.js'
import { connecter, lireBase, SQL_JOUR_OUVERT, surveillerConsole, verifierEcran } from './outils.js'

const fr = (iso) => iso.split('-').reverse().join('/')
let ferie = ''
let apres = ''
const FERIE = () => ferie
const APRES = () => apres

test.beforeAll(() => {
  // Jour des rendez-vous « SUIVI Férié », choisi par e2e/donnees.sql : ni férié, ni fermé.
  ferie = lireBase(`
    select a.local_date from public.appointments a
      join public.patients p on p.id = a.patient_id
     where p.last_name = 'SUIVI' and p.first_name = 'Férié 1' and a.status = 'scheduled'`)
  // Jour du report : le jour ouvert suivant.
  apres = lireBase(`
    select min(d)::date from public.organizations o,
           generate_series('${ferie}'::date + 1, '${ferie}'::date + 60, interval '1 day') d
     where o.name = 'Poste de santé Test' and ${SQL_JOUR_OUVERT('d::date')}`)
  expect(ferie).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  expect(apres).toMatch(/^\d{4}-\d{2}-\d{2}$/)
})

test.describe('jour férié daté après coup', () => {
  test('owner : rendez-vous du jour affichés puis reportés en un geste', async ({ page }) => {
    const erreurs = surveillerConsole(page)
    await page.setViewportSize({ width: 360, height: 900 })
    await connecter(page, COMPTES.ownerPoste)
    await page.goto('/app/rendez-vous/parametres?onglet=feries')
    await page.getByRole('button', { name: 'Ajouter un autre jour férié' }).click()
    const bloc = page.getByRole('region', { name: 'Autre jour férié' })
    await bloc.getByLabel(/^Date/).fill(fr(FERIE()))
    await bloc.getByLabel(/^Nom/).fill('Tabaski (test)')
    await bloc.getByRole('button', { name: 'Ajouter le jour férié' }).click()

    const fenetre = page.getByRole('dialog', { name: /^Rendez-vous du / })
    await expect(fenetre).toBeVisible()
    await expect(fenetre.getByText('Tabaski (test) : jour férié.', { exact: false })).toBeVisible()
    await expect(fenetre.getByText('2 rendez-vous pris ce jour-là')).toBeVisible()
    await expect(fenetre.getByText('SUIVI Férié 1')).toBeVisible()
    await expect(fenetre.getByText('SUIVI Férié 2')).toBeVisible()
    // Case pré-remplie avec le prochain jour ouvert (ni férié, ni fermé), modifiable.
    const caseDate = fenetre.getByLabel(/^Reporter au/)
    await expect(caseDate).toHaveValue(/^\d{2}\/\d{2}\/\d{4}$/)
    const proposee = (await caseDate.inputValue()).split('/').reverse().join('-')
    expect(proposee > FERIE()).toBe(true)
    await expect(fenetre.getByText('Prochain jour ouvert proposé', { exact: false })).toBeVisible()
    await caseDate.fill(fr(APRES()))
    await verifierEcran(page, 'ferie-report-360')
    await page.setViewportSize({ width: 1440, height: 900 })
    await verifierEcran(page, 'ferie-report-1440')
    await fenetre.getByRole('button', { name: 'Reporter 2 rendez-vous' }).click()
    // Nouveau jour ouvert : aucune confirmation demandée.
    await expect(page.getByText(`2 rendez-vous reportés au ${fr(APRES())}.`)).toBeVisible()
    await expect(fenetre.getByText('Aucun rendez-vous à reporter ce jour-là.')).toBeVisible()
    await fenetre.getByRole('button', { name: 'Fermer', exact: true }).first().click()

    // Nouveaux rendez-vous au jour choisi, même heure ; anciens « Reporté » au jour férié.
    await page.goto(`/app/rendez-vous?date=${APRES()}`)
    for (const [nom, heure] of [
      ['SUIVI Férié 1', '09:00'],
      ['SUIVI Férié 2', '10:00'],
    ]) {
      await expect(page.getByRole('listitem').filter({ hasText: nom })).toContainText(heure)
    }
    await page.goto(`/app/rendez-vous?date=${FERIE()}`)
    await page.getByText('Annulés et reportés', { exact: true }).click()
    await expect(
      page.getByRole('listitem').filter({ hasText: 'SUIVI Férié 1' }).getByText('Reporté').first(),
    ).toBeVisible()
    expect(erreurs).toEqual([])
  })
})
