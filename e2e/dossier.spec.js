// Dossier médical (étape 14, partie C) : antécédents, chronologie, consultation sensible,
// sur le serveur et la base locaux. Données : e2e/donnees.sql (« DOSSIER Khadija » :
// passage du jour, PF dans 10 jours, consultation ordinaire, consultation sensible par
// TDR VIH, antécédents ordinaire et sensible, 24 passages anciens ; « DOSSIER Seynabou »
// en consultation).
//   - 360, 768 et 1440 px, owner (n'exerce pas), accueil, caissier, pharmacien : aucun
//     antécédent, aucun motif ni diagnostic, à l'écran comme dans les réponses de l'API ;
//     chronologie limitée aux passages et aux rendez-vous, PF affichée « Consultation » ;
//     comptable : fiche fermée ;
//   - aide-soignant : rien de sensible (ni ligne, ni compteur, ni mention) ;
//   - infirmier : panneau des antécédents à côté de la saisie (replié sur mobile), ajout
//     rapide depuis la consultation, chronologie par pages et filtrable ; consultation
//     rendue sensible par un diagnostic, et le restant après validation ; une ligne du
//     journal par ouverture, pas à chaque relecture.
import { expect, test } from '@playwright/test'
import { COMPTES } from './comptes.js'
import {
  ajouterJours,
  aujourdhui,
  connecter,
  LARGEURS,
  lireBase,
  relever,
  surveillerConsole,
  verifierEcran,
} from './outils.js'

const MEDICAL =
  /Brûlures mictionnelles|Toux persistante|Râles bronchiques|Paludisme|Dépistage volontaire|TDR VIH|Drépanocytose|Infection VIH|Planification|Renouvellement implant/
const SENSIBLE = /Dépistage volontaire|TDR VIH|Infection VIH|Sensible/

const idPatient = (prenom) =>
  lireBase(
    `select id from public.patients where last_name = 'DOSSIER' and first_name = '${prenom}'`,
  )

async function ouvrirChronologie(page, id) {
  await page.goto(`/app/patients/${id}?onglet=chronologie`)
  await expect(page.getByRole('tab', { name: 'Chronologie', selected: true })).toBeVisible()
  await expect(page.locator('.ligne-chronologie').first()).toBeVisible()
}

const NON_MEDICAUX = [
  ['owner', COMPTES.ownerPoste],
  ['accueil', COMPTES.accueil],
  ['caissier', COMPTES.caissier],
]

for (const largeur of LARGEURS) {
  test.describe(`${largeur} px — rôles non médicaux`, () => {
    test.use({ viewport: { width: largeur, height: 900 } })

    for (const [role, compte] of NON_MEDICAUX) {
      test(`chronologie sans contenu médical — ${role}`, async ({ page }) => {
        const erreurs = surveillerConsole(page)
        const reponses = relever(page, /\/rest\/v1\//)
        await connecter(page, compte)
        const id = idPatient('Khadija')
        await ouvrirChronologie(page, id)
        await expect(page.getByRole('tab', { name: 'Médical' })).toHaveCount(0)
        // Passages et rendez-vous seulement ; la PF est une « Consultation ».
        await expect(page.getByRole('button', { name: 'Consultations' })).toHaveCount(0)
        const genres = await page.locator('.ligne-chronologie__genre').allInnerTexts()
        expect(genres.length).toBeGreaterThan(0)
        expect(genres.every((g) => /^(passage|rendez-vous)$/i.test(g))).toBe(true)
        const rdv = page.locator('.ligne-chronologie--appointment')
        await expect(rdv).toHaveCount(1)
        await expect(rdv.locator('.ligne-chronologie__titre')).toContainText('Consultation')
        await expect(page.locator('main')).not.toContainText(MEDICAL)
        await verifierEcran(page, `dossier-chronologie-${role}`)
        // Rien de médical non plus dans les réponses de l'API.
        expect(reponses.filter((r) => MEDICAL.test(r.texte)).map((r) => r.url)).toEqual([])
        expect(
          reponses.filter((r) => /get_medical_history|get_encounter|patient_medical/.test(r.url)),
        ).toEqual([])
        expect(erreurs).toEqual([])
      })
    }

    test('pharmacien : chronologie vide, aucun antécédent', async ({ page }) => {
      const erreurs = surveillerConsole(page)
      const reponses = relever(page, /\/rest\/v1\//)
      await connecter(page, COMPTES.pharmacien)
      await page.goto(`/app/patients/${idPatient('Khadija')}?onglet=chronologie`)
      await expect(page.getByText('Rien dans le dossier pour l’instant')).toBeVisible()
      await expect(page.getByRole('tab', { name: 'Médical' })).toHaveCount(0)
      await expect(page.locator('main')).not.toContainText(MEDICAL)
      await verifierEcran(page, 'dossier-chronologie-pharmacien')
      expect(reponses.filter((r) => MEDICAL.test(r.texte)).map((r) => r.url)).toEqual([])
      expect(erreurs).toEqual([])
    })
  })
}

test('comptable : fiche du patient fermée, rien de médical', async ({ page }) => {
  const reponses = relever(page, /\/rest\/v1\//)
  await connecter(page, COMPTES.comptable)
  await page.goto(`/app/patients/${idPatient('Khadija')}?onglet=chronologie`)
  await page.waitForLoadState('networkidle')
  await expect(page.locator('main')).toBeVisible()
  await expect(page.locator('main')).not.toContainText(/Khadija|DOSSIER/)
  await expect(page.locator('main')).not.toContainText(MEDICAL)
  expect(reponses.filter((r) => MEDICAL.test(r.texte) || /Khadija/.test(r.texte))).toEqual([])
})

test.describe('1440 px — soignants', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('aide-soignant : aucune trace de ce qui est sensible', async ({ page }) => {
    const erreurs = surveillerConsole(page)
    const reponses = relever(page, /\/rest\/v1\//)
    await connecter(page, COMPTES.aideSoignant)
    const id = idPatient('Khadija')
    await ouvrirChronologie(page, id)
    await page.getByRole('button', { name: 'Consultations' }).click()
    await expect(page.locator('.ligne-chronologie--encounter')).toHaveCount(1)
    await expect(page.locator('.ligne-chronologie--encounter')).toContainText('Paludisme')
    await expect(page.locator('main')).not.toContainText(SENSIBLE)
    // Rendez-vous de PF : « Consultation », comme pour l'accueil (types discrets réservés
    // aux soignants habilités).
    await page.getByRole('button', { name: 'Rendez-vous' }).click()
    await expect(page.locator('.ligne-chronologie--appointment')).toContainText('Consultation')
    await expect(page.locator('main')).not.toContainText(/Planification|Renouvellement implant/)
    await verifierEcran(page, 'dossier-aide-soignant-chronologie')
    await page.getByRole('tab', { name: 'Médical' }).click()
    await expect(page.getByText('Drépanocytose SS')).toBeVisible()
    await expect(page.locator('main')).not.toContainText(SENSIBLE)
    await expect(page.getByRole('button', { name: 'Nouvel antécédent' })).toHaveCount(0)
    await verifierEcran(page, 'dossier-aide-soignant-medical')
    // Recherche de l'en-tête : rien de médical n'y est cherché.
    await page.getByRole('combobox').first().fill('VIH')
    await expect(page.locator('main')).not.toContainText(SENSIBLE)
    expect(
      reponses
        .filter(
          (r) => SENSIBLE.test(r.texte) || /Planification|Renouvellement implant/.test(r.texte),
        )
        .map((r) => r.url),
    ).toEqual([])
    expect(erreurs).toEqual([])
  })

  test('infirmier : chronologie complète, par pages, filtrable', async ({ page }) => {
    const erreurs = surveillerConsole(page)
    await connecter(page, COMPTES.infirmier)
    await ouvrirChronologie(page, idPatient('Khadija'))
    // Plus récente en haut : le rendez-vous de PF dans 10 jours, avec son vrai type.
    await expect(page.locator('.ligne-chronologie').first()).toContainText('Planification')
    await expect(page.locator('.ligne-chronologie')).toHaveCount(20)
    await page.getByRole('button', { name: 'Afficher plus' }).click()
    await expect(page.locator('.ligne-chronologie')).toHaveCount(28)
    await expect(page.getByRole('button', { name: 'Afficher plus' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Consultations' }).click()
    const consultations = page.locator('.ligne-chronologie--encounter')
    await expect(consultations).toHaveCount(2)
    await expect(consultations.filter({ hasText: 'Sensible' })).toHaveCount(1)
    await verifierEcran(page, 'dossier-infirmier-chronologie')
    // Le lien d'une consultation y mène, et le retour ramène à la fiche.
    await consultations.filter({ hasText: 'Paludisme' }).getByRole('link').click()
    await page.waitForURL(/\/app\/consultations\//)
    await page
      .locator('.en-tete-consultation')
      .getByRole('link', { name: 'Fiche du patient' })
      .click()
    await page.waitForURL(/\/app\/patients\//)
    expect(erreurs).toEqual([])
  })
})

for (const largeur of LARGEURS) {
  test(`${largeur} px — infirmier : antécédents dans la consultation, ajout rapide`, async ({
    page,
  }) => {
    test.setTimeout(90 * 1000)
    const erreurs = surveillerConsole(page)
    await page.setViewportSize({ width: largeur, height: 900 })
    await connecter(page, COMPTES.infirmier)
    await page.goto(`/app/patients/${idPatient('Seynabou')}`)
    await page.getByRole('button', { name: 'Nouvelle consultation' }).click()
    await page.waitForURL(/\/app\/consultations\/[0-9a-f-]{36}$/)
    const panneau = page.locator('.mise-en-page-consultation__panneau')
    const titre = panneau.getByRole('button', { name: /^Antécédents/ })
    // Ouvert à côté de la saisie sur grand écran, replié au-dessus sur téléphone.
    if (largeur >= 1200) {
      await expect(titre).toHaveAttribute('aria-expanded', 'true')
      const p = await panneau.boundingBox()
      const s = await page.locator('.mise-en-page-consultation__principal').boundingBox()
      expect(p.x).toBeGreaterThan(s.x + s.width - 1)
    } else {
      await expect(titre).toHaveAttribute('aria-expanded', 'false')
      await titre.click()
    }
    const libelle = `Hypertension ${largeur}`
    await panneau.getByRole('button', { name: 'Nouvel antécédent' }).click()
    await panneau.getByRole('textbox', { name: /^Antécédent/ }).fill(libelle)
    await panneau.getByLabel(/^Depuis l’année/).fill('20')
    await panneau.getByRole('button', { name: 'Ajouter', exact: true }).click()
    await expect(
      panneau.getByText('Écrivez l’année sur 4 chiffres, par exemple 2019.'),
    ).toBeVisible()
    await panneau.getByLabel(/^Depuis l’année/).fill('2020')
    await panneau.getByRole('button', { name: 'Ajouter', exact: true }).click()
    await expect(panneau.getByText('Antécédent ajouté.', { exact: false })).toBeVisible()
    await expect(panneau.locator('.antecedents__ligne', { hasText: libelle })).toContainText(
      'depuis 2020',
    )
    // La saisie de la consultation n'a pas bougé : on peut continuer.
    await expect(page.getByRole('textbox', { name: /^Motif de consultation/ })).toBeVisible()
    await verifierEcran(page, 'dossier-consultation-antecedents')
    expect(erreurs).toEqual([])
  })
}

test.describe('1440 px — consultation sensible', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('diagnostic sensible : case cochée d’office, sensible après validation, une ligne du journal par ouverture', async ({
    page,
  }) => {
    test.setTimeout(90 * 1000)
    const erreurs = surveillerConsole(page)
    await connecter(page, COMPTES.infirmier)
    await page.goto('/app/file-attente')
    const onglet = page
      .getByRole('group', { name: 'Colonne affichée' })
      .getByRole('button', { name: /En consultation/ })
    if (await onglet.isVisible()) await onglet.click()
    await page
      .locator('.carte-file', { hasText: 'DOSSIER Seynabou' })
      .getByRole('button', { name: /Commencer la consultation/ })
      .click()
    await page.waitForURL(/\/app\/consultations\/[0-9a-f-]{36}$/)
    const id = page.url().split('/').at(-1)
    const caseSensible = page.getByRole('checkbox', { name: 'Consultation sensible' })
    await expect(caseSensible).not.toBeChecked()
    await page.getByRole('searchbox', { name: 'Chercher un diagnostic' }).fill('VIH')
    await page.getByRole('button', { name: /B20\s*Maladie due au VIH/ }).click()
    await expect(caseSensible).toBeChecked()
    await expect(caseSensible).toBeDisabled()
    await expect(page.locator('.en-tete-consultation').getByText('Sensible')).toBeVisible()
    await page.getByRole('button', { name: 'Valider la consultation' }).click()
    await page
      .getByRole('dialog', { name: 'Valider la consultation ?' })
      .getByRole('button', { name: 'Valider la consultation' })
      .click()
    await expect(page.getByText('Validée', { exact: true })).toBeVisible()
    await expect(page.locator('.en-tete-consultation').getByText('Sensible')).toBeVisible()
    expect(lireBase(`select is_sensitive from public.encounters where id = '${id}'`)).toBe('t')

    // Journal : relectures de la même ouverture (validation, avenant) -> une seule ligne.
    const lectures = () =>
      Number(
        lireBase(
          `select count(*) from public.audit_logs where action = 'READ' and table_name = 'encounters' and record_id = '${id}'`,
        ),
      )
    const avant = lectures()
    expect(avant).toBe(1)
    await page.getByRole('button', { name: 'Corriger ou compléter (avenant)' }).click()
    const avenant = page.getByRole('dialog', { name: 'Ajouter un avenant' })
    await avenant.getByRole('textbox').fill('Patiente orientée vers le centre de dépistage.')
    await avenant.getByRole('button', { name: 'Ajouter l’avenant' }).click()
    await expect(page.getByText('Patiente orientée vers le centre de dépistage.')).toBeVisible()
    expect(lectures()).toBe(1)
    // Nouvelle ouverture : une ligne de plus.
    await page.goto('/app/consultations')
    await page.goto(`/app/consultations/${id}`)
    await expect(page.getByText('Validée', { exact: true })).toBeVisible()
    await expect.poll(lectures).toBe(2)

    // Antécédent ajouté pendant une consultation sensible : case cochée d'office, expliquée,
    // que le soignant peut décocher.
    const panneau = page.locator('.mise-en-page-consultation__panneau')
    await panneau.getByRole('button', { name: 'Nouvel antécédent' }).click()
    const caseAnt = panneau.getByRole('checkbox', { name: 'Antécédent sensible' })
    await expect(caseAnt).toBeChecked()
    await expect(caseAnt).toBeEnabled()
    await expect(
      panneau.getByText(/Cochée d’office parce que cette consultation est sensible/),
    ).toBeVisible()
    await caseAnt.uncheck()
    await panneau.getByRole('textbox', { name: /^Antécédent/ }).fill('Appendicectomie')
    await panneau.getByRole('button', { name: 'Ajouter', exact: true }).click()
    const ligneAnt = panneau.locator('.antecedents__ligne', { hasText: 'Appendicectomie' })
    await expect(ligneAnt).toBeVisible()
    await expect(ligneAnt.getByText('Sensible')).toHaveCount(0)
    // Avenant et antécédent : deux boutons bien distincts.
    await expect(
      page.getByRole('button', { name: 'Corriger ou compléter (avenant)' }),
    ).toBeVisible()
    expect(erreurs).toEqual([])
  })
})

test.describe('1440 px — agenda, rendez-vous discret masqué', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  for (const [role, compte] of [
    ['aide-soignant', COMPTES.aideSoignant],
    ['accueil', COMPTES.accueil],
  ]) {
    test(`${role} : PF « Consultation », ni note, ni « Changer le type »`, async ({ page }) => {
      const erreurs = surveillerConsole(page)
      const reponses = relever(
        page,
        /\/rest\/v1\/rpc\/(list_appointments|list_patient_appointments)/,
      )
      await connecter(page, compte)
      await page.goto(`/app/rendez-vous?date=${ajouterJours(aujourdhui(), 1)}`)
      const ligne = page.getByRole('listitem').filter({ hasText: 'Note discrète' })
      await expect(ligne).toBeVisible()
      await expect(page.locator('main')).not.toContainText(/Planification|Dépistage/)
      await ligne.getByRole('button', { name: /^Détails/ }).click()
      const detail = page.getByRole('dialog', { name: 'Rendez-vous' })
      await expect(detail.getByText('Consultation', { exact: true })).toBeVisible()
      await expect(detail.getByRole('button', { name: 'Changer le type' })).toHaveCount(0)
      await expect(detail).not.toContainText(/Implant|Planification/)
      // Report : comme une consultation (aucune séance PF proposée, aucun « séance pleine »).
      if (await detail.getByRole('button', { name: 'Reporter' }).count()) {
        await detail.getByRole('button', { name: 'Reporter' }).click()
        const report = page.getByRole('dialog', { name: 'Reporter le rendez-vous' })
        await expect(report).toBeVisible()
        await page.waitForLoadState('networkidle')
        await expect(report).not.toContainText(/Planification|pleine|PF/)
        await page.keyboard.press('Escape')
      }
      await page.keyboard.press('Escape')
      // Prise de rendez-vous : aucune case de note, aucun type discret proposé.
      await page.getByRole('button', { name: 'Nouveau rendez-vous' }).click()
      const prise = page.getByRole('dialog', { name: 'Nouveau rendez-vous' })
      await expect(prise.getByLabel(/^Note/)).toHaveCount(0)
      await expect(prise).not.toContainText(/Planification|Dépistage/)
      await verifierEcran(page, `agenda-discret-${role}`)
      for (const r of reponses) {
        expect(r.texte, r.url).not.toMatch(
          /Planification|Implant à retirer|"is_discreet":true|"followup"/,
        )
      }
      expect(erreurs).toEqual([])
    })
  }
})
