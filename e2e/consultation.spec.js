// Parcours de l'écran de consultation (étape 14, partie B), sur le serveur et la base
// locaux. Données : e2e/donnees.sql (patients « CONSULT … » en consultation).
//   - 360, 768 et 1440 px, pour owner (qui n'exerce pas), infirmier, accueil, caissier :
//     bouton « Commencer la consultation » réservé aux soignants qui rédigent ; aucun
//     contenu médical à l'écran ni dans les réponses réseau des autres rôles ;
//   - 360 et 1440 px : écran de consultation (sections, motif et constantes repris),
//     validation et lecture seule ;
//   - 1440 px : saisie, enregistrement serveur, coupure du réseau et rechargement (rien
//     perdu), diagnostics (recherche, favori, déclaration immédiate), examen rapide,
//     validation, lecture seule, avenant ; Journée du jour ; reprise par un collègue
//     (confirmation, heure du dernier enregistrement) ; version dépassée (deux appareils) ;
//     aide-soignant en lecture seule.
import { expect, test } from '@playwright/test'
import { COMPTES } from './comptes.js'
import { connecter, LARGEURS, relever, surveillerConsole, verifierEcran } from './outils.js'

const MEDICAL =
  /Toux et fièvre|Douleurs abdominales|Contrôle de tension|Maux de tête|Examen neurologique|Paracétamol, revoir|draft_data/
const API_CONSULT =
  /\/rest\/v1\/(rpc\/(get_encounter|start_encounter|save_encounter_draft|my_draft_encounters|search_diagnoses|encounter_permissions)|encounters|encounter_types|rapid_test_types)/

const ROLES = [
  ['owner', COMPTES.ownerPoste, false],
  ['infirmier', COMPTES.infirmier, true],
  ['accueil', COMPTES.accueil, false],
  ['caissier', COMPTES.caissier, false],
]

// Tableau de la file, colonne « En consultation » (une seule colonne à la fois sur mobile).
async function ouvrirColonneConsultation(page) {
  await page.goto('/app/file-attente')
  await page.locator('.carte-file').first().waitFor({ state: 'attached' })
  const onglet = page
    .getByRole('group', { name: 'Colonne affichée' })
    .getByRole('button', { name: /En consultation/ })
  if (await onglet.isVisible()) await onglet.click()
  const carte = page.locator('.carte-file', { hasText: 'CONSULT Lecture' })
  await expect(carte).toBeVisible()
  return carte
}

async function commencer(page, prenom) {
  await ouvrirColonneConsultation(page)
  const carte = page.locator('.carte-file', { hasText: `CONSULT ${prenom}` })
  await carte.getByRole('button', { name: /Commencer la consultation/ }).click()
  await page.waitForURL(/\/app\/consultations\/[0-9a-f-]{36}$/)
  await expect(page.getByRole('heading', { name: `CONSULT ${prenom}` })).toBeVisible()
}

// Champ de saisie par son libellé (« Motif de consultation » porte aussi « obligatoire »).
const champ = (page, nom) => page.getByRole('textbox', { name: new RegExp(`^${nom}`) })

for (const largeur of LARGEURS) {
  test.describe(`${largeur} px`, () => {
    test.use({ viewport: { width: largeur, height: 900 } })

    for (const [role, compte, soignant] of ROLES) {
      test(`file et journée — ${role}`, async ({ page }) => {
        const erreurs = surveillerConsole(page)
        const reponses = relever(page, API_CONSULT)
        await connecter(page, compte)
        const carte = await ouvrirColonneConsultation(page)
        await expect(carte.getByRole('button', { name: /Commencer la consultation/ })).toHaveCount(
          soignant ? 1 : 0,
        )
        await verifierEcran(page, `consultation-file-${role}-${largeur}`)
        await page.goto('/app')
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
        await verifierEcran(page, `consultation-journee-${role}-${largeur}`)
        if (role === 'owner') {
          // Owner qui n'exerce pas : la page dit pourquoi, sans rien demander à la base.
          await page.goto('/app/consultations')
          await expect(
            page.getByText('Les consultations sont réservées aux soignants'),
          ).toBeVisible()
          await verifierEcran(page, `consultation-reservee-${largeur}`)
        }
        if (!soignant) {
          const texte = await page.locator('body').innerText()
          expect(texte).not.toMatch(MEDICAL)
          for (const r of reponses) expect(r.texte, r.url).not.toMatch(MEDICAL)
          expect(reponses.filter((r) => /get_encounter|start_encounter/.test(r.url))).toEqual([])
        }
        expect(erreurs, 'erreurs dans la console').toEqual([])
      })
    }

    if (largeur !== 768) {
      test('écran de consultation — infirmier', async ({ page }) => {
        const erreurs = surveillerConsole(page)
        await connecter(page, COMPTES.infirmier)
        // Passage dont la consultation est déjà validée : une nouvelle consultation
        // s'ouvre, motif de la file repris ; validée aussitôt, puis lecture seule.
        await commencer(page, 'Lecture')
        await expect(champ(page, 'Motif de consultation')).toHaveValue('Maux de tête')
        await page.getByRole('button', { name: 'Valider la consultation' }).click()
        await page
          .getByRole('dialog', { name: 'Valider la consultation ?' })
          .getByRole('button', { name: 'Valider la consultation' })
          .click()
        await expect(page.getByText('Validée', { exact: true })).toBeVisible()
        await expect(page.getByRole('button', { name: 'Ajouter un avenant' })).toBeVisible()
        await verifierEcran(page, `consultation-lecture-${largeur}`)
        await commencer(page, 'Aliou')
        await expect(champ(page, 'Motif de consultation')).toHaveValue('Contrôle de tension')
        await expect(page.getByText(/TA 125\/80/)).toBeVisible()
        await verifierEcran(page, `consultation-saisie-${largeur}`)
        expect(erreurs).toEqual([])
      })
    }
  })
}

test.describe('1440 px — saisie, coupure, validation', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('infirmier : saisie, coupure, diagnostics, validation, avenant', async ({
    page,
    context,
  }) => {
    test.setTimeout(150 * 1000)
    const erreurs = surveillerConsole(page)
    await connecter(page, COMPTES.infirmier)
    await commencer(page, 'Fatou')
    await expect(champ(page, 'Motif de consultation')).toHaveValue('Toux et fièvre depuis 3 jours')
    const envoi = page.waitForResponse(/rpc\/save_encounter_draft/, { timeout: 15000 })
    await champ(page, 'Histoire de la maladie').fill('Toux grasse, frissons le soir.')
    expect((await envoi).ok()).toBe(true)
    await expect(page.getByText(/^Enregistré à \d\d:\d\d$/)).toBeVisible()

    // Coupure du réseau : la saisie continue, gardée sur l'appareil.
    await context.setOffline(true)
    await champ(page, 'Examen clinique').fill('Râles crépitants à droite.')
    await expect(page.getByText(/Hors ligne : saisie gardée sur cet appareil/)).toBeVisible({
      timeout: 15000,
    })
    await context.setOffline(false)
    // Rechargement avant le prochain envoi (coupure de courant) : rien n'est perdu.
    await champ(page, 'Conduite à tenir').fill('Amoxicilline, revoir dans 3 jours.')
    await page.waitForTimeout(800)
    await page.reload()
    await expect(champ(page, 'Examen clinique')).toHaveValue('Râles crépitants à droite.')
    await expect(champ(page, 'Conduite à tenir')).toHaveValue('Amoxicilline, revoir dans 3 jours.')
    await expect(page.getByText(/^Enregistré à \d\d:\d\d$/)).toBeVisible({ timeout: 15000 })

    // Diagnostics : recherche, favori, principal, déclaration immédiate.
    const recherche = page.getByRole('searchbox', { name: 'Chercher un diagnostic' })
    await recherche.fill('pneumonie')
    await page.getByRole('button', { name: /J18\.9\s*Pneumonie/ }).click()
    await page.getByRole('button', { name: 'Ajouter aux favoris : Pneumonie' }).click()
    await expect(
      page.getByRole('button', { name: 'Retirer des favoris : Pneumonie' }),
    ).toBeVisible()
    await recherche.fill('cholera')
    await page.getByRole('button', { name: /A00\.9\s*Choléra/ }).click()
    await expect(page.getByText('Maladie à déclaration immédiate : Choléra')).toBeVisible()
    await expect(page.getByText('Validez la consultation pour déclencher l’alerte.')).toBeVisible()
    const diagnostics = page.getByRole('list', { name: 'Diagnostics retenus' })
    await expect(diagnostics.getByRole('radio', { name: 'Principal' }).first()).toBeChecked()

    // Examen rapide : résultat exigé avant la validation.
    await page.getByLabel('Ajouter un examen rapide').selectOption({ label: 'TDR paludisme' })
    await page.getByRole('button', { name: 'Ajouter', exact: true }).click()
    await page.getByRole('button', { name: 'Valider la consultation' }).click()
    await expect(page.getByText('Choisissez le résultat.')).toBeVisible()
    await page.getByRole('radio', { name: 'Négatif' }).check()
    await verifierEcran(page, 'consultation-avant-validation')

    // Journée du jour : consultation non validée.
    await page.goto('/app')
    const brouillons = page.getByRole('region', { name: /Vos consultations non validées/ })
    await expect(brouillons.getByRole('link', { name: 'CONSULT Fatou' })).toBeVisible()
    await brouillons.getByRole('link', { name: 'CONSULT Fatou' }).click()
    await expect(page.getByRole('radio', { name: 'Négatif' })).toBeChecked()
    // Le lien retour ramène d'où l'on vient : Journée du jour, puis page Consultations.
    await page
      .locator('.en-tete-consultation')
      .getByRole('link', { name: 'Journée du jour' })
      .click()
    await page.waitForURL(/\/app$/)
    await page.goto('/app/consultations')
    await page.getByRole('link', { name: 'CONSULT Fatou' }).click()
    await page.waitForURL(/\/app\/consultations\/[0-9a-f-]{36}$/)
    await page.reload()
    const retour = page
      .locator('.en-tete-consultation')
      .getByRole('link', { name: 'Consultations' })
    await expect(retour).toBeVisible()
    await retour.click()
    await page.waitForURL(/\/app\/consultations$/)
    await page.getByRole('link', { name: 'CONSULT Fatou' }).click()

    await page.getByRole('button', { name: 'Valider la consultation' }).click()
    const fenetre = page.getByRole('dialog', { name: 'Valider la consultation ?' })
    await expect(fenetre.getByText(/alerte de déclaration immédiate : Choléra/)).toBeVisible()
    await fenetre.getByRole('button', { name: 'Valider la consultation' }).click()
    await expect(page.getByText('Validée', { exact: true })).toBeVisible()
    await expect(page.getByRole('textbox')).toHaveCount(0)
    await expect(page.getByText('Râles crépitants à droite.')).toBeVisible()

    await page.getByRole('button', { name: 'Ajouter un avenant' }).click()
    const avenant = page.getByRole('dialog', { name: 'Ajouter un avenant' })
    await avenant.getByRole('textbox').fill('Radiographie demandée au centre de santé.')
    await avenant.getByRole('button', { name: 'Ajouter l’avenant' }).click()
    await expect(page.getByText('Radiographie demandée au centre de santé.')).toBeVisible()
    await expect(page.locator('.lecture-consultation__signature')).toHaveText(
      /^\d\d\/\d\d\/\d{4} \d\d:\d\d · Awa Faye$/,
    )
    await verifierEcran(page, 'consultation-validee')

    await page.goto('/app')
    await expect(page.getByRole('link', { name: 'CONSULT Fatou' })).toHaveCount(0)
    expect(erreurs).toEqual([])
  })

  test('reprise par la sage-femme, avec confirmation', async ({ browser }) => {
    test.setTimeout(120 * 1000)
    const infirmier = await (await browser.newContext()).newPage()
    await connecter(infirmier, COMPTES.infirmier)
    await commencer(infirmier, 'Ibrahima')
    const envoi = infirmier.waitForResponse(/rpc\/save_encounter_draft/, { timeout: 15000 })
    await champ(infirmier, 'Histoire de la maladie').fill('Douleur épigastrique après les repas.')
    expect((await envoi).ok()).toBe(true)

    const sageFemme = await (await browser.newContext()).newPage()
    const erreurs = surveillerConsole(sageFemme)
    await connecter(sageFemme, COMPTES.sageFemme)
    await commencer(sageFemme, 'Ibrahima').catch(() => {})
    await expect(
      sageFemme.getByRole('heading', { name: /Consultation commencée par Awa Faye à \d\d:\d\d/ }),
    ).toBeVisible()
    // Le contenu du brouillon reste réservé à son auteur.
    await expect(sageFemme.getByText('Douleur épigastrique')).toHaveCount(0)
    await verifierEcran(sageFemme, 'consultation-tenue')
    await sageFemme.getByRole('button', { name: 'Reprendre la consultation' }).click()
    const fenetre = sageFemme.getByRole('dialog', { name: 'Reprendre la consultation ?' })
    await expect(fenetre.getByText(/Awa Faye a enregistré il y a \d+ secondes/)).toBeVisible()
    await expect(fenetre.getByText('Awa Faye est peut-être encore en train d’écrire')).toBeVisible()
    await fenetre.getByRole('button', { name: 'Reprendre la consultation' }).click()
    await expect(champ(sageFemme, 'Histoire de la maladie')).toHaveValue(
      'Douleur épigastrique après les repas.',
    )

    // L'infirmier ne peut plus écrire : rien n'est écrasé, sa saisie reste sur l'appareil.
    await champ(infirmier, 'Examen clinique').fill('Abdomen souple.')
    await expect(infirmier.getByText('Cette consultation n’est plus entre vos mains')).toBeVisible({
      timeout: 15000,
    })
    await expect(champ(sageFemme, 'Examen clinique')).toHaveValue('')
    expect(erreurs).toEqual([])
  })

  test('même consultation sur deux appareils : rien n’est écrasé', async ({ browser }) => {
    test.setTimeout(120 * 1000)
    const contexte1 = await browser.newContext()
    const appareil1 = await contexte1.newPage()
    await connecter(appareil1, COMPTES.infirmier)
    await commencer(appareil1, 'Aliou')
    const adresse = appareil1.url()
    const appareil2 = await (await browser.newContext()).newPage()
    await connecter(appareil2, COMPTES.infirmier)
    await appareil2.goto(adresse)
    await expect(champ(appareil2, 'Motif de consultation')).toBeVisible()

    const envoi1 = appareil1.waitForResponse(/rpc\/save_encounter_draft/, { timeout: 15000 })
    await champ(appareil1, 'Examen clinique').fill('TA 150/95 au repos.')
    expect((await envoi1).ok()).toBe(true)
    await champ(appareil2, 'Examen clinique').fill('TA 140/90.')
    await expect(
      appareil2.getByText('Cette consultation a été modifiée sur un autre appareil'),
    ).toBeVisible({ timeout: 15000 })
    await verifierEcran(appareil2, 'consultation-conflit')
    await appareil2.getByRole('button', { name: 'Garder la version du serveur' }).click()
    await expect(champ(appareil2, 'Examen clinique')).toHaveValue('TA 150/95 au repos.')
  })

  test('aide-soignant : lecture seule, aucun bouton de rédaction', async ({ page }) => {
    const erreurs = surveillerConsole(page)
    await connecter(page, COMPTES.aideSoignant)
    const carte = await ouvrirColonneConsultation(page)
    await expect(carte.getByRole('button', { name: /Commencer la consultation/ })).toHaveCount(0)
    await page.goto('/app/consultations')
    await expect(page.getByText('Lecture seule')).toBeVisible()
    expect(erreurs).toEqual([])
  })
})
