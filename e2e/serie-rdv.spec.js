// Parcours des rendez-vous récurrents (étape 13, partie E) : l'accueil ne prend aucune
// série d'un type discret ; un soignant prend une PF tous les 3 mois, 4 fois, dont la 2e
// date tombe un jour férié (« Fête de la série », e2e/donnees.sql) : date signalée avant
// l'enregistrement, déplacée seule (« Jour suivant »), puis série enregistrée ; dates
// gardées en brouillon pendant une coupure ; l'accueil voit ensuite 4 « Consultation »
// sans série. Fenêtre vérifiée à 360, 768 et 1440 px.
import { expect, test } from '@playwright/test'
import { COMPTES } from './comptes.js'
import {
  ajouterJours,
  aujourdhui,
  connecter,
  LARGEURS,
  relever,
  surveillerConsole,
  verifierEcran,
} from './outils.js'

const fr = (iso) => iso.split('-').reverse().join('/')
const DEPART = () => ajouterJours(aujourdhui(), 20)

async function ouvrirSerie(page) {
  await page.goto('/app/rendez-vous')
  await page.getByRole('button', { name: 'Série de rendez-vous' }).click()
  const fenetre = page.getByRole('dialog', { name: 'Série de rendez-vous' })
  await expect(fenetre).toBeVisible()
  return fenetre
}

async function preparer(fenetre) {
  await fenetre.getByRole('searchbox', { name: 'Patient' }).fill('SUIVI Série')
  await fenetre.getByRole('list', { name: 'Dossiers trouvés' }).getByRole('button').first().click()
  await fenetre
    .getByLabel('Type de rendez-vous')
    .selectOption({ label: 'Planification familiale (20 min)' })
  await expect(fenetre.getByLabel(/^Tous les … mois/)).toHaveValue('3')
  await fenetre.getByLabel(/^Date/).fill(fr(DEPART()))
  await fenetre.getByLabel(/^Heure/).fill('10:00')
  await fenetre.getByLabel(/^Nombre de rendez-vous/).fill('4')
  await fenetre.getByRole('button', { name: 'Voir les dates' }).click()
  await expect(fenetre.locator('.table-serie__ligne')).toHaveCount(4)
}

for (const largeur of LARGEURS) {
  test.describe(`${largeur} px`, () => {
    test.use({ viewport: { width: largeur, height: 900 } })

    test('infirmier : dates contrôlées, jour férié signalé', async ({ page }) => {
      const erreurs = surveillerConsole(page)
      await connecter(page, COMPTES.infirmier)
      const fenetre = await ouvrirSerie(page)
      await preparer(fenetre)
      const deuxieme = fenetre.locator('.table-serie__ligne').nth(1)
      await expect(deuxieme.getByText('À confirmer')).toBeVisible()
      await expect(deuxieme.getByText(/jour férié \(Fête de la série\)/)).toBeVisible()
      await expect(
        fenetre.getByRole('button', { name: 'Confirmer et enregistrer la série' }),
      ).toBeEnabled()
      await verifierEcran(page, 'serie-dates')
      expect(erreurs).toEqual([])
    })
  })
}

test.describe('1440 px — série', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('accueil : aucun type discret proposé dans une série', async ({ page }) => {
    const erreurs = surveillerConsole(page)
    await connecter(page, COMPTES.accueil)
    const fenetre = await ouvrirSerie(page)
    const options = await fenetre
      .getByLabel('Type de rendez-vous')
      .locator('option')
      .allInnerTexts()
    expect(options.join(' | ')).not.toMatch(/Planification|Dépistage/)
    expect(erreurs).toEqual([])
  })

  test('infirmier : coupure, date déplacée seule, série enregistrée', async ({ page, context }) => {
    const erreurs = surveillerConsole(page)
    await connecter(page, COMPTES.infirmier)
    let fenetre = await ouvrirSerie(page)
    await preparer(fenetre)

    // Coupure : enregistrement impossible, saisie et dates gardées sur l'appareil.
    await context.setOffline(true)
    await expect(fenetre.getByText('Vous êtes hors ligne')).toBeVisible()
    await expect(
      fenetre.getByRole('button', { name: 'Confirmer et enregistrer la série' }),
    ).toBeDisabled()
    await context.setOffline(false)
    await page.reload()
    fenetre = await ouvrirSerie(page)
    await expect(fenetre.locator('.table-serie__ligne')).toHaveCount(4)
    await fenetre.getByRole('button', { name: 'Vérifier à nouveau' }).click()

    // 2e date : jour férié, déplacée au lendemain ; les autres ne bougent pas.
    const deuxieme = fenetre.locator('.table-serie__ligne').nth(1)
    await expect(deuxieme.getByText('À confirmer')).toBeVisible()
    await deuxieme.getByRole('button', { name: 'Jour suivant' }).click()
    await expect(deuxieme.getByText('Libre')).toBeVisible()
    await expect(fenetre.locator('.table-serie__ligne', { hasText: 'Libre' })).toHaveCount(4)
    await fenetre.getByRole('button', { name: 'Enregistrer la série' }).click()
    await expect(page.getByText('Série de 4 rendez-vous enregistrée')).toBeVisible()
    expect(erreurs.filter((e) => !/ERR_INTERNET_DISCONNECTED|Failed to fetch/.test(e))).toEqual([])
  })

  test('accueil : la série de PF reste « Consultation », sans série', async ({ page }) => {
    const erreurs = surveillerConsole(page)
    const reponses = relever(page, /\/rest\/v1\/rpc\/(list_patient_appointments|list_appointments)/)
    await connecter(page, COMPTES.accueil)
    await page.goto(`/app/rendez-vous?date=${DEPART()}`)
    await page.getByRole('link', { name: 'SUIVI Série' }).click()
    await page.getByRole('tab', { name: 'Rendez-vous' }).click()
    await expect(page.getByText('À venir (4)')).toBeVisible()
    const texte = await page.locator('main').innerText()
    expect(texte).not.toMatch(/Planification|Série,/)
    for (const r of reponses) expect(r.texte).not.toMatch(/Planification|"series_index":\d/)
    expect(erreurs).toEqual([])
  })
})
