// Parcours de l'agenda (étape 13) : vues jour / semaine / liste à 360, 768 et 1440 px,
// confidentialité des types discrets par rôle, paramètres des séances et leurs garde-fous.
// Données : supabase/tests/donnees_agenda.sql et e2e/donnees.sql (base fajkat_e2e).
import { expect, test } from '@playwright/test'
import { COMPTES } from './comptes.js'
import {
  ajouterJours,
  aujourdhui,
  connecter,
  LARGEURS,
  prochainMardi,
  relever,
  surveillerConsole,
  verifierEcran,
} from './outils.js'

// Ce qui ne doit jamais atteindre l'accueil, le caissier ni l'owner qui n'exerce pas : nom
// d'un type discret, note. L'owner lit les types et séances discrets pour les paramétrer
// (appointment_types, appointment_sessions), jamais sur un rendez-vous.
const SENSIBLE = /Planification familiale|Dépistage|Implant à retirer|"is_discreet":true/
const API_AGENDA =
  /\/rest\/v1\/(rpc\/(list_appointments|appointments_to_remind)|appointment_types|appointment_sessions)/

const VUES = [
  { nom: 'jour', adresse: () => '/app/rendez-vous' },
  { nom: 'semaine', adresse: () => `/app/rendez-vous?vue=semaine&date=${prochainMardi()}` },
  { nom: 'liste', adresse: () => '/app/rendez-vous?vue=liste' },
]

for (const largeur of LARGEURS) {
  test.describe(`${largeur} px`, () => {
    test.use({ viewport: { width: largeur, height: 900 } })

    for (const [role, compte] of [
      ['owner', COMPTES.ownerPoste],
      ['infirmier', COMPTES.infirmier],
      ['accueil', COMPTES.accueil],
      ['caissier', COMPTES.caissier],
    ]) {
      test(`agenda du poste — ${role}`, async ({ page }) => {
        const erreurs = surveillerConsole(page)
        const reponses = relever(page, API_AGENDA)
        const medical = role === 'infirmier'
        await connecter(page, compte)
        for (const vue of VUES) {
          await page.goto(vue.adresse())
          await expect(page.getByRole('heading', { name: 'Agenda', level: 1 })).toBeVisible()
          await expect(page.getByText('TEST Agenda 1').first()).toBeVisible()
          await verifierEcran(page, `agenda-${vue.nom}-${role}`)
          const texte = await page.locator('main').innerText()
          if (medical) {
            if (vue.nom === 'jour') expect(texte).toContain('Planification familiale')
          } else {
            expect(texte, `${role} : type discret à l'écran (${vue.nom})`).not.toMatch(SENSIBLE)
            expect(texte).not.toContain('Discret')
          }
        }
        if (!medical) {
          for (const r of reponses) {
            if (role === 'owner' && /appointment_(types|sessions)/.test(r.url)) continue
            expect(r.texte, `${role} : donnée sensible reçue (${r.url})`).not.toMatch(SENSIBLE)
          }
          await expect(page.getByRole('link', { name: 'Paramètres de l’agenda' })).toHaveCount(
            role === 'owner' ? 1 : 0,
          )
        }
        expect(erreurs, 'erreurs dans la console').toEqual([])
      })
    }
  })
}

test.describe('1440 px — détails', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('vue jour : colonnes élargies, numéro de dossier entier, aujourd’hui', async ({ page }) => {
    const erreurs = surveillerConsole(page)
    await connecter(page, COMPTES.ownerPoste)
    await page.goto('/app/rendez-vous')
    const colonnes = page.locator('.vue-jour__colonne')
    await expect(colonnes.first()).toBeVisible()
    const n = await colonnes.count()
    const largeurs = await colonnes.evaluateAll((els) =>
      els.map((e) => e.getBoundingClientRect().width),
    )
    const zone = await page
      .locator('.vue-jour__colonnes')
      .evaluate((e) => e.getBoundingClientRect().width)
    // Peu de colonnes : elles se partagent toute la largeur (au moins 90 %).
    expect(n).toBeGreaterThan(0)
    expect(largeurs.reduce((a, b) => a + b, 0)).toBeGreaterThan(zone * 0.85)
    await expect(page.getByText(/^PS-\d{4}-\d{6}$/).first()).toBeVisible()

    // « Aujourd'hui » : une mention, puis un vrai bouton ailleurs.
    await expect(page.getByText('Aujourd’hui affiché')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Revenir à aujourd’hui' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Jour suivant' }).click()
    await page.getByRole('button', { name: 'Revenir à aujourd’hui' }).click()
    await expect(page.getByText('Aujourd’hui affiché')).toBeVisible()
    expect(erreurs).toEqual([])
  })

  test('vue semaine : lignes compactes tronquées, séances pleines', async ({ page }) => {
    const erreurs = surveillerConsole(page)
    await connecter(page, COMPTES.ownerPoste)
    await page.goto(`/app/rendez-vous?vue=semaine&date=${prochainMardi()}`)
    const long = page.locator('.ligne-rdv-compacte__nom', { hasText: 'NDIAYE-DIALLO' })
    await expect(long).toBeVisible()
    // Nom long : une seule ligne, tronqué par « … » (texte complet en infobulle).
    const mesure = await long.evaluate((e) => ({
      ellipse: getComputedStyle(e).textOverflow,
      tronque: e.scrollWidth > e.clientWidth,
      hauteur: e.getBoundingClientRect().height,
      ligne: parseFloat(getComputedStyle(e).lineHeight),
    }))
    expect(mesure.ellipse).toBe('ellipsis')
    expect(mesure.tronque).toBe(true)
    expect(mesure.hauteur).toBeLessThan(mesure.ligne * 1.5)
    await expect(
      page.locator('.ligne-rdv-compacte__lien', { hasText: 'NDIAYE-DIALLO' }),
    ).toHaveAttribute('title', /Ndèye Fatou Bintou Khadidiatou/)
    await verifierEcran(page, 'semaine-detail')
    // Séance de 3 places remplie à J + 3 (donnees_agenda.sql) : sa semaine, quel que soit le
    // jour du lancement (elle n'est pas toujours dans celle du prochain mardi).
    await page.goto(`/app/rendez-vous?vue=semaine&date=${ajouterJours(aujourdhui(), 3)}`)
    await expect(page.getByText('Complet').first()).toBeVisible()
    expect(erreurs).toEqual([])
  })

  test('séances : type obligatoire, garde-fous de la base', async ({ page }) => {
    const erreurs = surveillerConsole(page)
    await connecter(page, COMPTES.ownerPoste)
    await page.goto('/app/rendez-vous/parametres?onglet=seances')

    // Type vide au départ et obligatoire.
    await page.getByRole('button', { name: 'Ajouter une séance' }).click()
    const nouvelle = page.getByRole('region', { name: 'Nouvelle séance' })
    await expect(nouvelle.getByLabel('Type de rendez-vous')).toHaveValue('')
    await expect(nouvelle.getByRole('option', { name: 'Choisissez un type' })).toHaveCount(1)
    await nouvelle.getByRole('button', { name: 'Ajouter la séance' }).click()
    await expect(nouvelle.getByText('Choisissez le type de rendez-vous.')).toBeVisible()

    // Chevauchement refusé par la base.
    await nouvelle.getByLabel('Type de rendez-vous').selectOption({ label: 'Vaccination' })
    await nouvelle.getByLabel('Jour').selectOption({ label: 'Mardi' })
    await nouvelle.getByLabel('Début').fill('08:00')
    await nouvelle.getByLabel('Fin').fill('12:00')
    await nouvelle.getByRole('button', { name: 'Ajouter la séance' }).click()
    await expect(
      page.getByText(/existe déjà le mardi de 08:00 à 12:00 : les deux se chevauchent/),
    ).toBeVisible()
    await nouvelle.getByRole('button', { name: 'Annuler' }).click()

    // Séance qui a des rendez-vous à venir : type protégé.
    const mardi = page.getByRole('region', { name: 'Mardi' })
    const ligne = mardi.getByRole('listitem').filter({ hasText: '08:00 – 12:00 · Vaccination' })
    await ligne.getByRole('button', { name: 'Modifier' }).click()
    await mardi.getByLabel('Type de rendez-vous').selectOption({ label: 'Pansement et soins' })
    await mardi.getByRole('button', { name: 'Enregistrer' }).click()
    await expect(
      page.getByText(
        /Cette séance a 4 rendez-vous à venir : déplacez-les avant de changer son type\./,
      ),
    ).toBeVisible()
    await verifierEcran(page, 'seance-refus-type')
    await mardi.getByRole('button', { name: 'Annuler' }).click()

    // Retirer : prévenu avec le nombre de rendez-vous et ce qu'ils deviennent ; on garde.
    await ligne.getByRole('button', { name: 'Retirer' }).click()
    await expect(
      mardi.getByText(/Elle a 4 rendez-vous à venir\. Ils restent prévus à la même heure/),
    ).toBeVisible()
    await verifierEcran(page, 'seance-retrait')
    await mardi.getByRole('button', { name: 'Garder la séance' }).click()
    await expect(ligne).toBeVisible()
    // Les deux refus voulus (chevauchement, type) reviennent en 400 : Chromium les journalise.
    const refus = erreurs.filter((e) => /status of 400/.test(e))
    expect(refus).toHaveLength(2)
    expect(erreurs.filter((e) => !refus.includes(e))).toEqual([])
  })

  test('comptable : ni menu ni accès', async ({ page }) => {
    const erreurs = surveillerConsole(page)
    await connecter(page, COMPTES.comptable)
    await expect(page.getByRole('link', { name: 'Rendez-vous' })).toHaveCount(0)
    await page.goto('/app/rendez-vous')
    await expect(page.getByText('Cette page n’est pas accessible avec votre rôle.')).toBeVisible()
    await expect(page.getByText(/non inclus/i)).toHaveCount(0)
    expect(erreurs).toEqual([])
  })

  test('clinique : colonnes par praticien', async ({ page }) => {
    const erreurs = surveillerConsole(page)
    await connecter(page, COMPTES.ownerClinique)
    await page.goto(`/app/rendez-vous?date=${ajouterJours(aujourdhui(), 1)}`)
    await expect(page.getByRole('region', { name: 'Dr Aminata Sarr' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Sans praticien' })).toBeVisible()
    await verifierEcran(page, 'clinique-jour')
    expect(erreurs).toEqual([])
  })
})
