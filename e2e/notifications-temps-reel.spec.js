// Cloche en temps réel (étape 14, partie B, correctif) : l'infirmier valide une consultation
// de choléra ; l'owner, connecté sur un autre appareil, voit l'alerte urgente arriver sans
// recharger la page. Puis, temps réel coupé chez l'owner : l'alerte arrive quand même par
// la relecture de repli (toutes les 60 secondes). Jamais le nom du patient.
// Données : e2e/donnees.sql (patients « CONSULT Alerte » et « CONSULT Repli »).
import { expect, test } from '@playwright/test'
import { COMPTES } from './comptes.js'
import { connecter, surveillerConsole, verifierEcran } from './outils.js'

test.use({ viewport: { width: 1440, height: 900 } })

// Choléra validé par l'infirmier pour le patient « CONSULT <prenom> ».
async function validerCholera(browser, prenom) {
  const page = await (await browser.newContext()).newPage()
  await connecter(page, COMPTES.infirmier)
  await page.goto('/app/file-attente')
  await page
    .locator('.carte-file', { hasText: `CONSULT ${prenom}` })
    .getByRole('button', { name: /Commencer la consultation/ })
    .click()
  await page.waitForURL(/\/app\/consultations\//)
  await page.getByRole('searchbox', { name: 'Chercher un diagnostic' }).fill('cholera')
  await page.getByRole('button', { name: /A00\.9\s*Choléra/ }).click()
  await page.getByRole('button', { name: 'Valider la consultation' }).click()
  await page
    .getByRole('dialog', { name: 'Valider la consultation ?' })
    .getByRole('button', { name: 'Valider la consultation' })
    .click()
  await expect(page.getByText('Validée', { exact: true })).toBeVisible()
  await page.context().close()
}

// Owner sur la Journée du jour, toutes ses notifications déjà lues.
async function ownerPret(page) {
  await connecter(page, COMPTES.ownerPoste)
  const cloche = page.getByRole('button', { name: /^Notifications,/ })
  await expect(cloche).toBeVisible()
  if (!/aucune non lue/.test((await cloche.getAttribute('aria-label')) ?? '')) {
    await cloche.click()
    await page.getByRole('button', { name: 'Tout marquer comme lu' }).click()
    await expect(cloche).toHaveAttribute('aria-label', 'Notifications, aucune non lue')
    await page.keyboard.press('Escape')
  }
  return cloche
}

async function verifierAlerte(page, cloche) {
  await cloche.click()
  const alerte = page.getByText('Maladie à déclaration immédiate : Choléra').first()
  await expect(alerte).toBeVisible()
  await expect(page.getByText('À déclarer au district sans délai.').first()).toBeVisible()
  await expect(page.locator('.notifications__panneau')).not.toContainText(/CONSULT|Alerte|Repli/)
}

test('alerte urgente reçue en temps réel, sans rechargement', async ({ page, browser }) => {
  const erreurs = surveillerConsole(page)
  const cloche = await ownerPret(page)
  let chargements = 0
  page.on('load', () => {
    chargements += 1
  })
  await validerCholera(browser, 'Alerte')
  await expect(cloche).toHaveAttribute(
    'aria-label',
    'Notifications, 1 non lue, dont au moins une urgente',
    { timeout: 10000 },
  )
  expect(chargements).toBe(0)
  await verifierAlerte(page, cloche)
  await verifierEcran(page, 'notification-temps-reel')
  expect(erreurs).toEqual([])
})

test('temps réel coupé : alerte reçue par la relecture de repli', async ({ page, browser }) => {
  test.setTimeout(150 * 1000)
  // Toute connexion Realtime refusée (limite de connexions atteinte, réseau filtrant).
  await page.routeWebSocket(/\/realtime\//, (ws) => ws.close())
  const cloche = await ownerPret(page)
  await validerCholera(browser, 'Repli')
  await expect(cloche).toHaveAttribute(
    'aria-label',
    'Notifications, 1 non lue, dont au moins une urgente',
    { timeout: 75 * 1000 },
  )
  await verifierAlerte(page, cloche)
})
