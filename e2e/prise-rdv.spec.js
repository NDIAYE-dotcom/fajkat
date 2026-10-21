// Parcours de la prise de rendez-vous (étape 13, partie D) : fenêtre « Nouveau rendez-vous »
// à 360, 768 et 1440 px, types discrets jamais proposés ni reçus par l'accueil, séance
// pleine (prochaines séances), jour férié à confirmer, report d'une PF masquée par
// l'accueil (vrai type gardé), changement de type par un soignant, coupure du réseau
// (saisie gardée), brouillon propre à chaque compte, file « Sage-femme » renommable.
// Les tests s'enchaînent dans l'ordre (fichier entier dans un worker) : chacun part des données
// laissées par le précédent (base du worker recréée à chaque lancement).
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

const SENSIBLE = /Planification familiale|Dépistage|Implant à retirer|"is_discreet":true/
const API_RDV =
  /\/rest\/v1\/(rpc\/(list_appointments|check_appointment|book_appointment|reschedule_appointment|next_available_sessions)|appointment_types|appointment_sessions|appointments)/

const jour = (n) => ajouterJours(aujourdhui(), n)
const fr = (iso) => iso.split('-').reverse().join('/')

async function ouvrirPrise(page) {
  await page.goto('/app/rendez-vous')
  await page.getByRole('button', { name: 'Nouveau rendez-vous' }).click()
  const fenetre = page.getByRole('dialog', { name: 'Nouveau rendez-vous' })
  await expect(fenetre).toBeVisible()
  return fenetre
}

async function choisirPatient(fenetre, recherche) {
  await fenetre.getByRole('searchbox', { name: 'Patient' }).fill(recherche)
  await fenetre.getByRole('list', { name: 'Dossiers trouvés' }).getByRole('button').first().click()
  await expect(fenetre.getByRole('button', { name: 'Changer de patient' })).toBeVisible()
}

async function remplir(fenetre, { type, date, heure }) {
  if (type) await fenetre.getByLabel('Type de rendez-vous').selectOption({ label: type })
  if (date) await fenetre.getByLabel(/^Date/).fill(fr(date))
  if (heure) await fenetre.getByLabel(/^Heure/).fill(heure)
}

for (const largeur of LARGEURS) {
  test.describe(`${largeur} px`, () => {
    test.use({ viewport: { width: largeur, height: 900 } })

    test('accueil : fenêtre de prise sans type discret', async ({ page }) => {
      const erreurs = surveillerConsole(page)
      const reponses = relever(page, API_RDV)
      await connecter(page, COMPTES.accueil)
      const fenetre = await ouvrirPrise(page)
      const options = await fenetre
        .getByLabel('Type de rendez-vous')
        .locator('option')
        .allInnerTexts()
      expect(options.join(' | ')).toContain('Consultation')
      expect(options.join(' | ')).not.toMatch(/Planification|Dépistage/)
      await choisirPatient(fenetre, 'Agenda 1')
      await remplir(fenetre, { type: 'Vaccination (10 min)', date: jour(1) })
      await verifierEcran(page, 'prise-accueil')
      for (const r of reponses) expect(r.texte, r.url).not.toMatch(SENSIBLE)
      expect(erreurs).toEqual([])
    })
  })
}

test.describe('1440 px — prise, report, type', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('infirmier : la planification familiale est proposée', async ({ page }) => {
    await connecter(page, COMPTES.infirmier)
    const fenetre = await ouvrirPrise(page)
    await expect(
      fenetre
        .getByLabel('Type de rendez-vous')
        .locator('option', { hasText: 'Planification familiale' }),
    ).toHaveCount(1)
  })

  test('accueil : prend une consultation', async ({ page }) => {
    const erreurs = surveillerConsole(page)
    await connecter(page, COMPTES.accueil)
    const fenetre = await ouvrirPrise(page)
    await choisirPatient(fenetre, 'Agenda 2')
    await remplir(fenetre, { type: 'Consultation (15 min)', date: jour(4), heure: '10:00' })
    await fenetre.getByRole('button', { name: 'Enregistrer le rendez-vous' }).click()
    const confirmer = fenetre.getByRole('button', { name: 'Confirmer le rendez-vous' })
    const pris = page.getByText(`Rendez-vous pris le ${fr(jour(4))} à 10:00`)
    await expect(confirmer.or(pris)).toBeVisible()
    if (await confirmer.isVisible()) await confirmer.click()
    await expect(pris).toBeVisible()
    await expect(fenetre).toBeHidden()
    expect(erreurs).toEqual([])
  })

  test('séance pleine : prochaine séance proposée et reprise d’un clic', async ({ page }) => {
    const erreurs = surveillerConsole(page)
    await connecter(page, COMPTES.ownerPoste)
    const fenetre = await ouvrirPrise(page)
    await choisirPatient(fenetre, 'Agenda 1')
    await remplir(fenetre, { type: 'Pansement et soins (15 min)', date: jour(3) })
    // Rien n'est coché d'office, et aucune heure libre n'est proposée sans le choisir.
    const horsSeance = fenetre.getByRole('radio', { name: 'Autre heure, hors séance' })
    await expect(horsSeance).not.toBeChecked()
    await expect(fenetre.getByRole('radio', { checked: true })).toHaveCount(0)
    await expect(fenetre.getByLabel(/^Heure/)).toHaveCount(0)
    await fenetre.getByRole('button', { name: 'Enregistrer le rendez-vous' }).click()
    await expect(
      fenetre.getByText('Choisissez une séance, ou « Autre heure, hors séance ».'),
    ).toBeVisible()
    // Séance pleine : signalée dès qu'elle est choisie, sans cliquer sur Enregistrer.
    const seance = fenetre.getByRole('radio', { name: /14:00 – 16:00\s*Complet/ })
    await seance.check()
    await expect(horsSeance).not.toBeChecked()
    await expect(fenetre.getByText('Séance pleine', { exact: true })).toBeVisible()
    await expect(fenetre.getByText(/Séance pleine le .* 3 \/ 3 rendez-vous/)).toBeVisible()
    await expect(fenetre.getByText('Prochaines séances avec des places :')).toBeVisible()
    // Hors séance pendant la séance pleine : confirmation demandée, rien n'est pris sans elle.
    await horsSeance.check()
    await fenetre.getByLabel(/^Heure/).fill('14:30')
    await fenetre.getByRole('button', { name: 'Enregistrer le rendez-vous' }).click()
    await expect(
      fenetre.getByText(
        'La séance de 14:00 est pleine : prendre quand même ce patient hors séance ?',
      ),
    ).toBeVisible()
    await expect(fenetre.getByRole('button', { name: 'Confirmer le rendez-vous' })).toBeVisible()
    await verifierEcran(page, 'prise-hors-seance-pleine')
    // Retour à la séance pleine : signalée de nouveau, la base la refuse à l'envoi.
    await seance.check()
    await expect(fenetre.getByText('Séance pleine', { exact: true })).toBeVisible()
    await fenetre.getByRole('button', { name: 'Enregistrer le rendez-vous' }).click()
    await expect(fenetre.getByText('Séance pleine', { exact: true })).toBeVisible()
    await expect(fenetre.getByText('Prochaines séances avec des places :')).toBeVisible()
    await expect(fenetre.getByText('Prochaines séances avec des places :')).toBeVisible()
    await verifierEcran(page, 'prise-seance-pleine')
    const proposition = fenetre.getByRole('button', { name: /14:00 – 16:00 · 3 places/ }).first()
    await proposition.click()
    await expect(fenetre.getByLabel(/^Date/)).toHaveValue(fr(jour(10)))
    await expect(fenetre.getByRole('radio', { name: /14:00 – 16:00\s*3 places/ })).toBeChecked()
    await fenetre.getByRole('button', { name: 'Enregistrer le rendez-vous' }).click()
    const confirmer = fenetre.getByRole('button', { name: 'Confirmer le rendez-vous' })
    const pris = page.getByText(`Rendez-vous pris le ${fr(jour(10))} à 14:00`)
    await expect(confirmer.or(pris)).toBeVisible()
    if (await confirmer.isVisible()) await confirmer.click()
    await expect(pris).toBeVisible()
    expect(erreurs).toEqual([])
  })

  test('hors séance pendant une séance pleine : pris seulement après confirmation', async ({
    page,
  }) => {
    const erreurs = surveillerConsole(page)
    await connecter(page, COMPTES.ownerPoste)
    const fenetre = await ouvrirPrise(page)
    await choisirPatient(fenetre, 'Agenda 2')
    await remplir(fenetre, { type: 'Pansement et soins (15 min)', date: jour(3) })
    await fenetre.getByRole('radio', { name: 'Autre heure, hors séance' }).check()
    await fenetre.getByLabel(/^Heure/).fill('15:00')
    await fenetre.getByRole('button', { name: 'Enregistrer le rendez-vous' }).click()
    await expect(
      fenetre.getByText(
        'La séance de 14:00 est pleine : prendre quand même ce patient hors séance ?',
      ),
    ).toBeVisible()
    await fenetre.getByRole('button', { name: 'Confirmer le rendez-vous' }).click()
    await expect(page.getByText(`Rendez-vous pris le ${fr(jour(3))} à 15:00`)).toBeVisible()
    await expect(fenetre).toBeHidden()
    expect(erreurs).toEqual([])
  })

  test('jour férié : confirmation demandée', async ({ page }) => {
    const erreurs = surveillerConsole(page)
    await connecter(page, COMPTES.accueil)
    const fenetre = await ouvrirPrise(page)
    await choisirPatient(fenetre, 'Agenda 3')
    await remplir(fenetre, { type: 'Consultation (15 min)', date: jour(6), heure: '11:00' })
    await fenetre.getByRole('button', { name: 'Enregistrer le rendez-vous' }).click()
    await expect(fenetre.getByText('À confirmer', { exact: true })).toBeVisible()
    await expect(fenetre.getByText(/est un jour férié/)).toBeVisible()
    await verifierEcran(page, 'prise-jour-ferie')
    await fenetre.getByRole('button', { name: 'Confirmer le rendez-vous' }).click()
    await expect(page.getByText(`Rendez-vous pris le ${fr(jour(6))} à 11:00`)).toBeVisible()
    expect(erreurs).toEqual([])
  })

  test('accueil : report d’une PF masquée, le vrai type est gardé', async ({ browser }) => {
    const accueil = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    const erreurs = surveillerConsole(accueil)
    const reponses = relever(accueil, API_RDV)
    await connecter(accueil, COMPTES.accueil)
    await accueil.goto(`/app/rendez-vous?date=${jour(1)}`)
    const ligne = accueil.getByRole('listitem').filter({ hasText: 'Note discrète' })
    await ligne.getByRole('button', { name: /^Détails/ }).click()
    const detail = accueil.getByRole('dialog', { name: 'Rendez-vous' })
    await expect(detail.getByText('Consultation', { exact: true })).toBeVisible()
    await expect(detail.getByRole('button', { name: 'Changer le type' })).toHaveCount(0)
    await verifierEcran(accueil, 'rdv-detail-accueil')
    await detail.getByRole('button', { name: 'Reporter' }).click()
    const report = accueil.getByRole('dialog', { name: 'Reporter le rendez-vous' })
    await report.getByLabel(/^Date/).fill(fr(jour(2)))
    await expect(report.getByLabel(/^Heure/)).toHaveValue('10:30')
    await verifierEcran(accueil, 'rdv-report-accueil')
    await report.getByRole('button', { name: 'Reporter', exact: true }).click()
    await expect(accueil.getByText(`Rendez-vous reporté le ${fr(jour(2))} à 10:30`)).toBeVisible()
    for (const r of reponses) expect(r.texte, r.url).not.toMatch(SENSIBLE)
    expect(erreurs).toEqual([])
    await accueil.close()

    const soignant = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    await connecter(soignant, COMPTES.infirmier)
    await soignant.goto(`/app/rendez-vous?date=${jour(2)}`)
    await expect(
      soignant.getByRole('region', { name: 'Planification familiale' }).getByText('Note discrète'),
    ).toBeVisible()
    await soignant.close()
  })

  test('infirmier : change le type ; l’accueil voit toujours « Consultation »', async ({
    browser,
  }) => {
    const infirmier = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    const erreurs = surveillerConsole(infirmier)
    await connecter(infirmier, COMPTES.infirmier)
    await infirmier.goto(`/app/rendez-vous?date=${jour(4)}`)
    const ligne = infirmier.getByRole('listitem').filter({ hasText: 'Agenda 2' })
    await ligne.getByRole('button', { name: /^Détails/ }).click()
    await infirmier
      .getByRole('dialog', { name: 'Rendez-vous' })
      .getByRole('button', { name: 'Changer le type' })
      .click()
    const fenetre = infirmier.getByRole('dialog', { name: 'Changer le type' })
    await fenetre
      .getByLabel('Nouveau type')
      .selectOption({ label: 'Planification familiale (20 min)' })
    await verifierEcran(infirmier, 'rdv-type-infirmier')
    await fenetre.getByRole('button', { name: 'Changer le type' }).click()
    const confirmer = fenetre.getByRole('button', { name: 'Confirmer le rendez-vous' })
    const change = infirmier.getByText('Type du rendez-vous changé')
    await expect(confirmer.or(change)).toBeVisible()
    if (await confirmer.isVisible()) await confirmer.click()
    await expect(change).toBeVisible()
    await expect(
      infirmier.getByRole('region', { name: 'Planification familiale' }).getByText('Agenda 2'),
    ).toBeVisible()
    expect(erreurs).toEqual([])
    await infirmier.close()

    const accueil = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    const reponses = relever(accueil, API_RDV)
    await connecter(accueil, COMPTES.accueil)
    await accueil.goto(`/app/rendez-vous?date=${jour(4)}`)
    await expect(
      accueil.getByRole('region', { name: 'Consultation' }).getByText('Agenda 2'),
    ).toBeVisible()
    expect(await accueil.locator('main').innerText()).not.toMatch(SENSIBLE)
    for (const r of reponses) expect(r.texte, r.url).not.toMatch(SENSIBLE)
    await accueil.close()
  })

  test('coupure du réseau : message clair, saisie gardée, envoi au retour', async ({
    page,
    context,
  }) => {
    await connecter(page, COMPTES.accueil)
    let fenetre = await ouvrirPrise(page)
    await choisirPatient(fenetre, 'Agenda 3')
    await remplir(fenetre, { type: 'Consultation (15 min)', date: jour(5), heure: '09:15' })
    await context.setOffline(true)
    await expect(fenetre.getByText('Vous êtes hors ligne')).toBeVisible()
    await expect(fenetre.getByRole('button', { name: 'Enregistrer le rendez-vous' })).toBeDisabled()
    await verifierEcran(page, 'prise-hors-ligne')
    // Fenêtre fermée puis rouverte (comme après une coupure) : la saisie revient.
    await fenetre.getByRole('button', { name: 'Fermer' }).click()
    await page.getByRole('button', { name: 'Nouveau rendez-vous' }).click()
    fenetre = page.getByRole('dialog', { name: 'Nouveau rendez-vous' })
    await expect(fenetre.getByText(/Votre saisie de .* a été retrouvée/)).toBeVisible()
    await expect(fenetre.getByLabel(/^Heure/)).toHaveValue('09:15')
    await expect(fenetre.getByLabel(/^Date/)).toHaveValue(fr(jour(5)))
    await context.setOffline(false)
    await expect(fenetre.getByRole('button', { name: 'Enregistrer le rendez-vous' })).toBeEnabled()
    await fenetre.getByRole('button', { name: 'Enregistrer le rendez-vous' }).click()
    const confirmer = fenetre.getByRole('button', { name: 'Confirmer le rendez-vous' })
    const pris = page.getByText(`Rendez-vous pris le ${fr(jour(5))} à 09:15`)
    await expect(confirmer.or(pris)).toBeVisible()
    if (await confirmer.isVisible()) await confirmer.click()
    await expect(pris).toBeVisible()
  })

  test('brouillon : propre au compte, effacé à la déconnexion', async ({ page }) => {
    await connecter(page, COMPTES.infirmier)
    const fenetre = await ouvrirPrise(page)
    await choisirPatient(fenetre, 'Agenda 1')
    await remplir(fenetre, { type: 'Planification familiale (20 min)' })
    await expect
      .poll(() =>
        page.evaluate(() =>
          Object.keys(localStorage).filter((c) => c.startsWith('fajkat.brouillon.')),
        ),
      )
      .toEqual([expect.stringContaining(COMPTES.infirmier.id)])
    // Ni la note ni le nom du type dans le brouillon.
    const contenu = await page.evaluate(() =>
      Object.entries(localStorage)
        .filter(([c]) => c.startsWith('fajkat.brouillon.'))
        .map(([, v]) => v)
        .join(''),
    )
    expect(contenu).not.toMatch(/Planification/)
    await fenetre.getByRole('button', { name: 'Fermer' }).click()
    await page.getByRole('button', { name: /menu de votre compte/ }).click()
    await page
      .getByRole('menuitem', { name: 'Se déconnecter' })
      .or(page.getByRole('button', { name: 'Se déconnecter' }))
      .click()
    await page.waitForURL(/\/connexion|\/$/)
    expect(
      await page.evaluate(() =>
        Object.keys(localStorage).filter((c) => c.startsWith('fajkat.brouillon.')),
      ),
    ).toEqual([])

    await connecter(page, COMPTES.accueil)
    const autre = await ouvrirPrise(page)
    await expect(autre.getByText(/a été retrouvée/)).toHaveCount(0)
    await expect(autre.getByRole('searchbox', { name: 'Patient' })).toHaveValue('')
  })

  test('Nouvelle arrivée : Entrée dans la recherche n’envoie pas l’arrivée', async ({ page }) => {
    const erreurs = surveillerConsole(page)
    await connecter(page, COMPTES.accueil)
    await page.goto('/app/file-attente')
    await page.getByRole('button', { name: /^(Nouvelle arrivée|Arrivée sans ticket)$/ }).click()
    const fenetre = page.getByRole('dialog', { name: 'Nouvelle arrivée' })
    await expect(fenetre.locator('form form')).toHaveCount(0)
    const recherche = fenetre.getByRole('searchbox', { name: 'Patient' })
    await recherche.fill('Agenda 1')
    await recherche.press('Enter')
    await expect(fenetre.getByRole('list', { name: 'Dossiers trouvés' })).toBeVisible()
    // Le formulaire de l'arrivée n'a pas été envoyé : aucune erreur sous les cases.
    await expect(fenetre.getByText('Choisissez le patient, ou créez son dossier.')).toHaveCount(0)
    await expect(fenetre).toBeVisible()
    await verifierEcran(page, 'arrivee-recherche')
    expect(erreurs).toEqual([])
  })

  test('file « Sage-femme » : nom neutre, renommable par l’owner', async ({ page }) => {
    const erreurs = surveillerConsole(page)
    await connecter(page, COMPTES.ownerPoste)
    await page.goto('/app/file-attente')
    await page.getByRole('button', { name: 'Noms des files' }).click()
    const fenetre = page.getByRole('dialog', { name: 'Noms des files' })
    await expect(fenetre.getByRole('listitem').filter({ hasText: /^B\s*Sage-femme/ })).toBeVisible()
    await expect(fenetre.getByText(/Planification/)).toHaveCount(0)
    await verifierEcran(page, 'noms-des-files')
    await fenetre.getByRole('button', { name: 'Renommer la file Sage-femme' }).click()
    await fenetre.getByLabel('Nouveau nom pour « Sage-femme »').fill('Maternité')
    await fenetre.getByRole('button', { name: 'Enregistrer' }).click()
    await expect(fenetre.getByRole('listitem').filter({ hasText: 'Maternité' })).toBeVisible()
    await fenetre.getByRole('button', { name: 'Renommer la file Maternité' }).click()
    await fenetre.getByLabel('Nouveau nom pour « Maternité »').fill('Sage-femme')
    await fenetre.getByRole('button', { name: 'Enregistrer' }).click()
    await expect(fenetre.getByRole('listitem').filter({ hasText: /^B\s*Sage-femme/ })).toBeVisible()
    expect(erreurs).toEqual([])
  })
})
