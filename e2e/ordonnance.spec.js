// Parcours de l'ordonnance (étape 14, partie D), sur le serveur et la base locaux.
// Données : e2e/donnees.sql (patients « ORDO … »).
//   - 360, 768 et 1440 px : saisie d'une ligne dans la consultation (mise en page) ;
//   - 1440 px : suggestions au clavier, « 1-0-1 » réparti, quantité calculée puis modifiée,
//     Entrée qui crée la ligne suivante, demi-comprimé, dose illisible signalée, ordre,
//     retrait, ligne vide ignorée, coupure et rechargement, validation, lignes en base ;
//   - impression A5 (français, wolof, consultation sensible) : PDF téléchargés dans
//     e2e/captures, convertis en image pour relecture ;
//   - Paramètres → Ordonnance (owner) : mots wolof enregistrés et repris à l'impression ;
//   - accueil, caissier, comptable, owner qui n'exerce pas : aucun médicament à l'écran ni
//     dans les réponses réseau ; aide-soignant : lecture sans impression.
import { execFileSync } from 'node:child_process'
import { expect, test } from '@playwright/test'
import { COMPTES } from './comptes.js'
import {
  connecter,
  LARGEURS,
  lireBase,
  relever,
  surveillerConsole,
  verifierEcran,
} from './outils.js'

const CAPTURES = new URL('./captures/', import.meta.url).pathname
const MEDICAMENTS = /Paracétamol|Amoxicilline|Microgynon|product_name/

const consultationDe = (prenom) =>
  lireBase(`select e.id from public.encounters e join public.patients p on p.id = e.patient_id
             where p.last_name = 'ORDO' and p.first_name = '${prenom}' and e.deleted_at is null
             order by e.created_at desc limit 1`)

async function commencer(page, prenom) {
  await page.goto('/app/file-attente')
  await page.locator('.carte-file').first().waitFor({ state: 'attached' })
  const onglet = page
    .getByRole('group', { name: 'Colonne affichée' })
    .getByRole('button', { name: /En consultation/ })
  if (await onglet.isVisible()) await onglet.click()
  const carte = page.locator('.carte-file', { hasText: `ORDO ${prenom}` })
  await carte.getByRole('button', { name: /Commencer la consultation/ }).click()
  await page.waitForURL(/\/app\/consultations\/[0-9a-f-]{36}$/)
  await expect(page.getByRole('heading', { name: `ORDO ${prenom}` })).toBeVisible()
}

const ligne = (page, n) => page.locator('.ligne-ordonnance').nth(n)
const caseDe = (l, nom) => l.getByRole('textbox', { name: new RegExp(`^${nom}`) })

// PDF converti en PNG (première page) par sips (macOS), pour relecture à l'œil.
function enImage(pdf) {
  try {
    execFileSync('sips', ['-s', 'format', 'png', pdf, '--out', pdf.replace(/\.pdf$/, '.png')], {
      stdio: 'ignore',
    })
  } catch {
    // Sans sips : le PDF reste dans e2e/captures.
  }
}

for (const largeur of LARGEURS) {
  test(`saisie d’une ligne — ${largeur} px`, async ({ page }) => {
    await page.setViewportSize({ width: largeur, height: 900 })
    const erreurs = surveillerConsole(page)
    await connecter(page, COMPTES.infirmier)
    await commencer(page, 'Largeur')
    if ((await page.locator('.ligne-ordonnance').count()) === 0) {
      await page.getByRole('button', { name: 'Ajouter un médicament' }).click()
    }
    const l = ligne(page, 0)
    await l.getByRole('combobox', { name: /^Médicament/ }).fill('Paracétamol')
    await caseDe(l, 'Dosage').fill('500 mg')
    await l.getByRole('combobox', { name: /^Forme/ }).selectOption({ label: 'Comprimé' })
    await caseDe(l, 'Matin').fill('1')
    await caseDe(l, 'Soir').fill('1')
    await caseDe(l, 'Durée').fill('5')
    await expect(caseDe(l, 'Quantité totale')).toHaveValue('10')
    await page.evaluate(() => document.activeElement?.blur())
    await verifierEcran(page, `ordonnance-saisie`)
    expect(erreurs).toEqual([])
  })
}

test.describe('1440 px', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('saisie au clavier, coupure, validation', async ({ page, context }) => {
    test.setTimeout(150 * 1000)
    const erreurs = surveillerConsole(page)
    await connecter(page, COMPTES.infirmier)
    await commencer(page, 'Mariama')
    await page.getByRole('button', { name: 'Ajouter un médicament' }).click()

    // Suggestion tirée des ordonnances de la structure, choisie au clavier.
    const l1 = ligne(page, 0)
    const nom1 = l1.getByRole('combobox', { name: /^Médicament/ })
    await expect(nom1).toBeFocused()
    await nom1.pressSequentially('parac')
    const option = page.getByRole('option', { name: /Paracétamol\s*500 mg · Comprimé/ })
    await expect(option).toBeVisible()
    await nom1.press('ArrowDown')
    await nom1.press('Enter')
    await expect(nom1).toHaveValue('Paracétamol')
    await expect(caseDe(l1, 'Dosage')).toHaveValue('500 mg')
    await expect(l1.getByRole('combobox', { name: /^Forme/ })).toHaveValue('comprime')
    await expect(l1.getByRole('combobox', { name: /^Voie/ })).toHaveValue('orale')

    // « 1-0-1 » réparti à la sortie de la case ; quantité calculée, puis modifiée.
    await caseDe(l1, 'Matin').fill('1-0-1')
    await caseDe(l1, 'Durée').focus()
    await expect(caseDe(l1, 'Matin')).toHaveValue('1')
    await expect(caseDe(l1, 'Midi')).toHaveValue('0')
    await expect(caseDe(l1, 'Soir')).toHaveValue('1')
    await caseDe(l1, 'Durée').fill('5')
    await expect(caseDe(l1, 'Quantité totale')).toHaveValue('10')
    await expect(l1.getByText('comprimés', { exact: true })).toBeVisible()
    await caseDe(l1, 'Quantité totale').fill('12')
    await expect(l1.getByRole('button', { name: 'Recalculer (10)' })).toBeVisible()

    // Entrée dans la dernière case : nouvelle ligne, son nom prend le focus.
    await l1.getByRole('combobox', { name: /^Consignes/ }).fill('Après le repas')
    await l1.getByRole('combobox', { name: /^Consignes/ }).press('Enter')
    const l2 = ligne(page, 1)
    const nom2 = l2.getByRole('combobox', { name: /^Médicament/ })
    await expect(nom2).toBeFocused()
    await nom2.fill('Amoxicilline')
    await nom2.press('Escape')
    await nom2.press('Enter')
    await expect(caseDe(l2, 'Dosage')).toBeFocused()
    await caseDe(l2, 'Dosage').fill('250 mg')
    // Sans forme, la quantité dit pourquoi elle reste vide.
    await expect(l2.getByText('Choisissez la forme pour calculer la quantité')).toBeVisible()
    await l2.getByRole('combobox', { name: /^Forme/ }).selectOption({ label: 'Gélule' })
    await caseDe(l2, 'Matin').fill('1/2')
    await caseDe(l2, 'Soir').fill('½')
    await caseDe(l2, 'Nuit').fill('abc')
    await caseDe(l2, 'Durée').fill('7')
    await expect(caseDe(l2, 'Quantité totale')).toHaveValue('7')

    // Troisième ligne retirée ; quatrième laissée vide (ignorée à la validation).
    await page.getByRole('button', { name: 'Ajouter un médicament' }).click()
    await ligne(page, 2)
      .getByRole('combobox', { name: /^Médicament/ })
      .fill('Vitamine C')
    await page.getByRole('button', { name: 'Retirer Vitamine C' }).click()
    await expect(page.locator('.ligne-ordonnance')).toHaveCount(2)
    await page.getByRole('button', { name: 'Ajouter un médicament' }).click()
    await page.getByRole('button', { name: 'Monter Amoxicilline' }).click()
    await expect(ligne(page, 0).getByRole('combobox', { name: /^Médicament/ })).toHaveValue(
      'Amoxicilline',
    )

    // Cas relevé : Cotrimoxazole 960 mg, 1-0-0, 30 jours, sans forme. Dosage « 960g » :
    // avertissement ; « 960mg » devient « 960 mg ».
    await page.getByRole('button', { name: 'Ajouter un médicament' }).click()
    const l4 = ligne(page, 3)
    await l4.getByRole('combobox', { name: /^Médicament/ }).fill('Cotrimoxazole')
    await caseDe(l4, 'Dosage').fill('960g')
    await caseDe(l4, 'Matin').focus()
    await expect(l4.getByText('Vérifiez le dosage : 960 g ?')).toBeVisible()
    await caseDe(l4, 'Dosage').fill('960mg')
    await caseDe(l4, 'Matin').fill('1-0-0')
    await expect(caseDe(l4, 'Dosage')).toHaveValue('960 mg')
    await expect(l4.getByText(/Vérifiez le dosage/)).toHaveCount(0)
    await caseDe(l4, 'Durée').fill('30')
    await expect(caseDe(l4, 'Quantité totale')).toHaveValue('')
    // Titres « Durée » et « Quantité totale » alignés.
    const hauts = await Promise.all(
      ['Durée', 'Quantité totale'].map((t) =>
        l4.locator('label', { hasText: new RegExp(`^${t}`) }).boundingBox(),
      ),
    )
    expect(Math.abs(hauts[0].y - hauts[1].y)).toBeLessThanOrEqual(1)

    // Dose illisible : signalée sous la case, rien n'est envoyé.
    await page.getByRole('button', { name: 'Valider la consultation' }).click()
    await expect(page.getByText('Tapez un nombre : 1, 2, 1/2 ou 0,5.')).toBeVisible()
    await verifierEcran(page, 'ordonnance-erreur')
    await caseDe(ligne(page, 0), 'Nuit').fill('')

    // Coupure du réseau puis rechargement : l'ordonnance est gardée sur l'appareil.
    await context.setOffline(true)
    await page
      .getByRole('textbox', { name: /^Remarque imprimée/ })
      .fill('Revenir si la fièvre persiste.')
    await expect(page.getByText(/Hors ligne : saisie gardée sur cet appareil/)).toBeVisible({
      timeout: 15000,
    })
    await context.setOffline(false)
    await page.waitForTimeout(800)
    await page.reload()
    // La ligne vide a été retirée au premier clic sur « Valider la consultation ».
    await expect(page.locator('.ligne-ordonnance')).toHaveCount(3)
    await expect(caseDe(ligne(page, 0), 'Matin')).toHaveValue('1/2')
    await expect(caseDe(ligne(page, 1), 'Quantité totale')).toHaveValue('12')
    await expect(page.getByRole('textbox', { name: /^Remarque imprimée/ })).toHaveValue(
      'Revenir si la fièvre persiste.',
    )
    await expect(page.getByText(/^Enregistré à \d\d:\d\d$/)).toBeVisible({ timeout: 15000 })

    await page.getByRole('button', { name: 'Valider la consultation' }).click()
    const fenetre = page.getByRole('dialog', { name: 'Valider la consultation ?' })
    // Avertissement non bloquant, confirmé par la validation.
    await expect(
      fenetre.getByText(
        'Cotrimoxazole 960 mg — Forme non choisie : la quantité ne sera pas calculée.',
      ),
    ).toBeVisible()
    await verifierEcran(page, 'ordonnance-avertissement')
    await fenetre.getByRole('button', { name: 'Valider la consultation' }).click()
    await expect(page.getByRole('button', { name: 'Imprimer l’ordonnance' })).toBeVisible()
    await expect(page.getByText('Revenir si la fièvre persiste.')).toBeVisible()
    await verifierEcran(page, 'ordonnance-validee')

    const lignes =
      lireBase(`select string_agg(i.product_name || ':' || coalesce(i.dose_morning::text, '-')
        || ':' || coalesce(i.dose_evening::text, '-') || ':' || coalesce(i.quantity::text, '-')
        || ':' || coalesce(i.quantity_unit, '-'), '|' order by i.sort_order)
      from public.prescription_items i join public.prescriptions p on p.id = i.prescription_id
      join public.patients pa on pa.id = p.patient_id
     where pa.last_name = 'ORDO' and pa.first_name = 'Mariama'`)
    expect(lignes).toBe(
      'Amoxicilline:0.50:0.50:7:gélules|Paracétamol:1.00:1.00:12:comprimés|Cotrimoxazole:1.00:0.00:-:-',
    )
    expect(erreurs).toEqual([])
  })

  test('Paramètres → Ordonnance : mots wolof (owner)', async ({ page }) => {
    const erreurs = surveillerConsole(page)
    await connecter(page, COMPTES.ownerPoste)
    await page.goto('/app/parametres?onglet=ordonnance')
    const nuit = page.getByRole('textbox', { name: /^Nuit en wolof/ })
    await expect(nuit).toHaveValue('Guddi')
    await nuit.fill('Guddi bi')
    await page.getByRole('button', { name: 'Enregistrer les modifications' }).click()
    await expect(page.getByText('Ordonnance : modifications enregistrées')).toBeVisible()
    await verifierEcran(page, 'ordonnance-parametres')
    expect(
      lireBase(`select settings #>> '{prescription_labels,wo,nuit}' from public.organizations
                 where name = 'Poste de santé Test'`),
    ).toBe('Guddi bi')
    expect(erreurs).toEqual([])
  })

  test('impression A5 : français, wolof, consultation sensible', async ({ page }) => {
    test.setTimeout(120 * 1000)
    const erreurs = surveillerConsole(page)
    await connecter(page, COMPTES.infirmier)
    for (const [prenom, fichier, wolof] of [
      ['Sokhna', 'ordonnance-fr', false],
      ['Sokhna', 'ordonnance-wo', true],
      ['Ndella', 'ordonnance-sensible', false],
    ]) {
      await page.goto(`/app/consultations/${consultationDe(prenom)}`)
      await page.getByRole('button', { name: 'Imprimer l’ordonnance' }).click()
      const fenetre = page.getByRole('dialog', { name: 'Imprimer l’ordonnance' })
      if (wolof) {
        await expect(fenetre.getByText(/Suba, Bëccëg, Ngoon, Guddi bi/)).toBeVisible()
        await fenetre.getByText('Libellés en wolof').click()
        await expect(fenetre.getByRole('checkbox', { name: /Libellés en wolof/ })).toBeChecked()
      }
      await expect(fenetre.getByRole('button', { name: 'Imprimer' })).toBeEnabled({
        timeout: 30000,
      })
      if (fichier === 'ordonnance-fr') await verifierEcran(page, 'ordonnance-impression')
      const telechargement = page.waitForEvent('download')
      await fenetre.getByRole('link', { name: 'Télécharger' }).click()
      const chemin = `${CAPTURES}${fichier}.pdf`
      await (await telechargement).saveAs(chemin)
      const debut = execFileSync('head', ['-c', '5', chemin], { encoding: 'utf8' })
      expect(debut).toBe('%PDF-')
      enImage(chemin)
      await fenetre.getByRole('button', { name: 'Fermer' }).click()
    }
    expect(erreurs).toEqual([])
  })

  test('aide-soignant : ordonnance lue, sans impression', async ({ page }) => {
    const erreurs = surveillerConsole(page)
    await connecter(page, COMPTES.aideSoignant)
    await page.goto(`/app/consultations/${consultationDe('Sokhna')}`)
    await expect(page.getByText(/^Paracétamol/).first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Imprimer l’ordonnance' })).toHaveCount(0)
    expect(erreurs).toEqual([])
  })

  for (const [role, compte] of [
    ['accueil', COMPTES.accueil],
    ['caissier', COMPTES.caissier],
    ['comptable', COMPTES.comptable],
    ['owner qui n’exerce pas', COMPTES.ownerPoste],
  ]) {
    test(`confidentialité — ${role}`, async ({ page }) => {
      const reponses = relever(page, /\/rest\/v1\//)
      await connecter(page, compte)
      await page.goto(`/app/consultations/${consultationDe('Sokhna')}`)
      await page.waitForLoadState('networkidle')
      const patient = lireBase(
        `select id from public.patients where last_name = 'ORDO' and first_name = 'Sokhna'`,
      )
      await page.goto(`/app/patients/${patient}`)
      await page.waitForLoadState('networkidle')
      const chronologie = page.getByRole('tab', { name: 'Chronologie' })
      if (await chronologie.isVisible()) {
        await chronologie.click()
        await page.waitForLoadState('networkidle')
      }
      expect(await page.locator('body').innerText()).not.toMatch(MEDICAMENTS)
      expect(reponses.filter((r) => MEDICAMENTS.test(r.texte)).map((r) => r.url)).toEqual([])
    })
  }
})
