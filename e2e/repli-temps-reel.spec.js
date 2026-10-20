// Filet de secours du temps réel (étape 14, correctif) : la file d'attente et l'écran d'appel
// se relisent seuls quand le canal Realtime est coupé (toutes les 60 secondes, au retour
// sur l'onglet), et l'écran d'appel se reconnecte seul après une coupure du serveur.
// Les arrivées et les appels sont faits dans la base au nom d'un autre compte, comme
// depuis un autre appareil (e2e/outils.js : ecrireBase).
import { expect, test } from '@playwright/test'
import { COMPTES } from './comptes.js'
import { connecter, ecrireBase, lireBase, surveillerConsole } from './outils.js'

test.use({ viewport: { width: 1440, height: 900 } })

const ORG = `(select id from public.organizations where name = 'Poste de santé Test')`
const FILE_A = `(select id from public.queue_services where org_id = ${ORG} and letter = 'A' and deleted_at is null)`

// Nouveau patient « REPLI <prenom> » arrivé dans la file A ; renvoie l'id du passage.
function arrivee(prenom) {
  return ecrireBase(
    COMPTES.accueil,
    `with p as (insert into public.patients (org_id, last_name, first_name, sex, declared_age)
                values (${ORG}, 'REPLI', '${prenom}', 'F', 30) returning id)
     select (public.register_arrival(${ORG}, (select id from p), ${FILE_A})).id;`,
  )
}

// Toute connexion Realtime refusée (limite de connexions atteinte, réseau filtrant).
const refuserRealtime = (page) => page.routeWebSocket(/\/realtime\//, (ws) => ws.close())

test.describe('file d’attente, temps réel coupé', () => {
  test('nouvelle arrivée affichée au retour sur l’onglet', async ({ page }) => {
    const erreurs = surveillerConsole(page)
    await refuserRealtime(page)
    await connecter(page, COMPTES.accueil)
    await page.goto('/app/file-attente')
    await expect(page.getByRole('heading', { name: 'File d’attente' })).toBeVisible()
    arrivee('Onglet')
    // Retour sur l'onglet (téléphone sorti de veille) : relecture immédiate.
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
    await expect(page.locator('.carte-file', { hasText: 'REPLI Onglet' })).toBeVisible({
      timeout: 5000,
    })
    expect(erreurs.filter((e) => !/WebSocket|realtime/i.test(e))).toEqual([])
  })

  test('nouvelle arrivée affichée par la relecture de 60 secondes', async ({ page }) => {
    test.setTimeout(150 * 1000)
    await refuserRealtime(page)
    await connecter(page, COMPTES.infirmier)
    await page.goto('/app/file-attente')
    await expect(page.getByRole('heading', { name: 'File d’attente' })).toBeVisible()
    await page.waitForLoadState('networkidle')
    arrivee('Minute')
    await expect(page.locator('.carte-file', { hasText: 'REPLI Minute' })).toBeVisible({
      timeout: 75 * 1000,
    })
  })
})

test.describe('écran d’appel', () => {
  let lien = ''
  test.beforeAll(() => {
    const jeton = ecrireBase(
      COMPTES.ownerPoste,
      `select token from public.create_display_screen(${ORG}, 'Écran repli');`,
    )
    expect(jeton).toMatch(/^[0-9a-f]{32,}$/)
    lien = `/ecran/${jeton}`
  })

  async function ouvrirEcran(page) {
    await page.goto(lien)
    await page.getByRole('button', { name: 'Continuer sans son' }).click()
  }

  test('temps réel coupé : appel affiché par la relecture de secours', async ({ page }) => {
    test.setTimeout(150 * 1000)
    await refuserRealtime(page)
    await ouvrirEcran(page)
    await expect(page.getByText('Reconnexion en cours…')).toBeVisible()
    const visite = arrivee('Ecran')
    const numero = lireBase(`select ticket_number from public.visits where id = '${visite}'`)
    ecrireBase(COMPTES.infirmier, `select public.call_visit('${visite}', 'consultation');`)
    await expect(page.locator('.ecran-appel__numero')).toHaveText(numero, { timeout: 75 * 1000 })
  })

  test('canal coupé par le serveur : reconnexion seule', async ({ page }) => {
    const sockets = []
    await page.routeWebSocket(/\/realtime\//, (ws) => {
      ws.connectToServer()
      sockets.push(ws)
    })
    await ouvrirEcran(page)
    await expect(page.getByText('Connecté', { exact: true })).toBeVisible()
    // Coupure côté serveur (redémarrage de Realtime, box internet relancée).
    sockets.splice(0).forEach((ws) => ws.close())
    await expect(page.getByText('Reconnexion en cours…')).toBeVisible()
    await expect(page.getByText('Connecté', { exact: true })).toBeVisible({ timeout: 30 * 1000 })
    expect(sockets.length).toBeGreaterThan(0)
  })
})
