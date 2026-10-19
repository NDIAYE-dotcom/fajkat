// Parcours du suivi des rendez-vous (étape 13, partie E) : « À rappeler demain » et
// onglet « Rendez-vous » de la fiche à 360, 768 et 1440 px pour owner, infirmier, accueil
// et caissier ; puis, à 1440 px : rappel fait (relu après rechargement, coupure du
// réseau), confirmé par le patient, absent, annulation avec motif, « Arrivé » d'une PF
// masquée (file du vrai type, ticket), planning imprimé (neutre par défaut, version
// soignant confidentielle). Données : e2e/donnees.sql (patients « SUIVI … »).
import { expect, test } from '@playwright/test'
import { mkdirSync } from 'node:fs'
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

const SENSIBLE =
  /Planification familiale|Dépistage|Implant à retirer|Pilule mal tolérée|"is_discreet":true/
const API =
  /\/rest\/v1\/(rpc\/(list_appointments|appointments_to_remind|list_patient_appointments|patient_appointment_stats|arrive_appointment|set_appointment_status|set_appointment_reminder)|appointments|appointment_types)/
const CAPTURES = new URL('./captures/', import.meta.url).pathname
mkdirSync(CAPTURES, { recursive: true })

const ROLES = [
  ['owner', COMPTES.ownerPoste, true],
  ['infirmier', COMPTES.infirmier, true],
  ['accueil', COMPTES.accueil, false],
  ['caissier', COMPTES.caissier, false],
]

// Fiche ouverte depuis le nom du patient dans « À rappeler demain ».
async function ouvrirFiche(page, prenom) {
  await page.goto('/app/rendez-vous/rappels')
  await page.getByRole('link', { name: `SUIVI ${prenom}` }).click()
  await expect(page.getByRole('tab', { name: 'Rendez-vous', selected: true })).toBeVisible()
  await expect(page.getByText(/Taux d’absence|pas encore de taux/)).toBeVisible()
}

for (const largeur of LARGEURS) {
  test.describe(`${largeur} px`, () => {
    test.use({ viewport: { width: largeur, height: 900 } })

    for (const [role, compte, medical] of ROLES) {
      test(`rappels et fiche — ${role}`, async ({ page }) => {
        const erreurs = surveillerConsole(page)
        const reponses = relever(page, API)
        await connecter(page, compte)

        await page.goto('/app/rendez-vous')
        await expect(page.getByRole('link', { name: /À rappeler demain \(\d+\)/ })).toBeVisible()
        await page.getByRole('link', { name: /À rappeler demain/ }).click()
        await expect(page.getByRole('heading', { name: 'À rappeler demain' })).toBeVisible()
        const liste = page.locator('.rappels__liste')
        await expect(liste.getByText('SUIVI Mariama')).toBeVisible()
        // PF sur le téléphone du conjoint, PF sans téléphone : absentes, sans aucune mention.
        await expect(page.getByText('Coumba')).toHaveCount(0)
        await expect(page.getByText('Note discrète')).toHaveCount(0)
        // Téléphone partagé : un seul groupe pour Modou et Aïda.
        const famille = liste.locator('.groupe-rappel', { hasText: 'SUIVI Modou' })
        await expect(famille.getByText('SUIVI Aïda')).toBeVisible()
        await expect(famille.getByText('Téléphone de la mère')).toBeVisible()
        await expect(famille.getByText('Langue : Français, Wolof')).toBeVisible()
        const mariama = liste.locator('.groupe-rappel', { hasText: 'SUIVI Mariama' })
        await expect(mariama.locator('blockquote')).toHaveText(
          /Rappel pour Mariama SUIVI : votre rendez-vous au poste de santé \(Consultation\) demain à 14:00\./,
        )
        // Titulaire accordé : « de la patiente », « du patient », « du conjoint ».
        await expect(mariama.getByText('Téléphone de la patiente')).toBeVisible()
        const ibou = liste.locator('.groupe-rappel', { hasText: 'SUIVI Ibou' })
        await expect(ibou.getByText('Téléphone du patient')).toBeVisible()
        await expect(ibou.locator('blockquote')).toHaveText(/\(Consultation\) demain à 15:30/)
        const fallou = liste.locator('.groupe-rappel', { hasText: 'SUIVI Fallou' })
        await expect(fallou.getByText('Téléphone du conjoint')).toBeVisible()
        await expect(liste).not.toContainText(/ de le | de un /)
        await verifierEcran(page, `rappels-${role}`)
        const texte = await page.locator('main').innerText()
        expect(texte).not.toMatch(/Pilule mal tolérée|Implant à retirer/)
        if (!medical) expect(texte).not.toMatch(SENSIBLE)

        await ouvrirFiche(page, 'Mariama')
        await expect(page.getByText('Taux d’absence : 50 %')).toBeVisible()
        await verifierEcran(page, `fiche-rdv-${role}`)
        const fiche = await page.locator('main').innerText()
        if (medical) {
          expect(fiche).toContain('Planification familiale')
          expect(fiche).toContain('Série, n° 1')
          // La note : soignants seulement (l'owner voit les types discrets, pas les notes).
          if (role === 'owner') expect(fiche).not.toContain('Pilule mal tolérée')
          else expect(fiche).toContain('Pilule mal tolérée')
        } else {
          expect(fiche).not.toMatch(/Planification|Série|Pilule/)
          for (const r of reponses) expect(r.texte, `${role} : ${r.url}`).not.toMatch(SENSIBLE)
        }
        expect(erreurs).toEqual([])
      })
    }
  })
}

test.describe('1440 px — statuts, arrivée, rappels, planning', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('accueil : rappel fait pour la famille, gardé ; hors ligne : cases désactivées', async ({
    page,
    context,
  }) => {
    const erreurs = surveillerConsole(page)
    await connecter(page, COMPTES.accueil)
    await page.goto('/app/rendez-vous/rappels')
    const famille = page.locator('.groupe-rappel', { hasText: 'SUIVI Modou' })
    // La case native est recouverte par son dessin : on clique sur le libellé, comme un doigt.
    await famille.getByText('Rappel fait (pour tous)').click()
    await expect(famille.getByText(/Par Fatou Samb, à \d{2}:\d{2}/)).toBeVisible()
    await expect(famille.getByText('Rappelé')).toBeVisible()
    const mariama = page.locator('.groupe-rappel', { hasText: 'SUIVI Mariama' })
    await mariama.getByText('Confirmé par le patient').click()
    await expect(mariama.getByRole('checkbox', { name: 'Confirmé par le patient' })).toBeChecked()

    await page.reload()
    await expect(famille.getByRole('checkbox', { name: /Rappel fait \(pour tous\)/ })).toBeChecked()
    await context.setOffline(true)
    await expect(page.getByText('Vous êtes hors ligne')).toBeVisible()
    await expect(mariama.getByRole('checkbox', { name: /Rappel fait/ })).toBeDisabled()
    await verifierEcran(page, 'rappels-hors-ligne')
    await context.setOffline(false)

    await page.goto(`/app/rendez-vous?date=${ajouterJours(aujourdhui(), 1)}`)
    const ligne = page.getByRole('listitem').filter({ hasText: 'SUIVI Mariama' })
    await expect(ligne.getByText('Confirmé')).toBeVisible()
    await expect(ligne.getByText(/Planification/)).toHaveCount(0)
    expect(erreurs.filter((e) => !/ERR_INTERNET_DISCONNECTED|Failed to fetch/.test(e))).toEqual([])
  })

  test('accueil : absent, remis à « prévu », annulation avec motif obligatoire', async ({
    page,
  }) => {
    const erreurs = surveillerConsole(page)
    await connecter(page, COMPTES.accueil)
    await page.goto('/app/rendez-vous')
    await page
      .getByRole('listitem')
      .filter({ hasText: 'SUIVI Absente' })
      .getByRole('button')
      .first()
      .click()
    const fenetre = page.getByRole('dialog', { name: 'Rendez-vous' })
    await fenetre.getByRole('button', { name: 'Absent' }).click()
    await expect(page.getByText('Patient noté absent')).toBeVisible()
    await expect(fenetre.locator('.tampon', { hasText: 'Absent' })).toBeVisible()
    await verifierEcran(page, 'rdv-absent')
    await fenetre.getByRole('button', { name: 'Remettre à « prévu »' }).click()
    await expect(fenetre.locator('.tampon', { hasText: 'Prévu' })).toBeVisible()
    await fenetre.getByRole('button', { name: 'Fermer', exact: true }).click()

    await page.goto(`/app/rendez-vous?date=${ajouterJours(aujourdhui(), 5)}`)
    await page
      .getByRole('listitem')
      .filter({ hasText: 'SUIVI Annulée' })
      .getByRole('button')
      .first()
      .click()
    await page.getByRole('button', { name: 'Annuler le rendez-vous' }).click()
    const annulation = page.getByRole('dialog', { name: 'Annuler le rendez-vous' })
    await annulation.getByRole('button', { name: 'Annuler le rendez-vous' }).click()
    await expect(annulation.getByText('Choisissez le motif de l’annulation.')).toBeVisible()
    await annulation.getByText('Autre', { exact: true }).click()
    await annulation.getByRole('button', { name: 'Annuler le rendez-vous' }).click()
    await expect(annulation.getByText('Écrivez le motif de l’annulation.')).toBeVisible()
    await verifierEcran(page, 'rdv-annulation')
    await annulation.getByText('Patient en voyage').click()
    await annulation.getByRole('button', { name: 'Annuler le rendez-vous' }).click()
    await expect(page.getByText('Rendez-vous annulé')).toBeVisible()
    expect(erreurs).toEqual([])
  })

  test('accueil : « Arrivé » d’une PF affichée « Consultation » : file du vrai type', async ({
    page,
  }) => {
    const erreurs = surveillerConsole(page)
    const reponses = relever(page, API)
    await connecter(page, COMPTES.accueil)
    await page.goto('/app/rendez-vous')
    const ligne = page.getByRole('listitem').filter({ hasText: 'SUIVI Rokhaya' })
    await expect(ligne.getByText(/Planification/)).toHaveCount(0)
    await ligne.getByRole('button').first().click()
    await page.getByRole('button', { name: 'Arrivé' }).click()
    const arrivee = page.getByRole('dialog', { name: 'Arrivée du patient' })
    await expect(arrivee.getByLabel('File d’attente')).toHaveCount(0)
    await verifierEcran(page, 'rdv-arrivee')
    await arrivee.getByRole('button', { name: 'Enregistrer l’arrivée' }).click()
    const ticket = page.getByRole('dialog', { name: /Arrivée enregistrée : [A-Z]-\d{3}/ })
    await expect(ticket).toBeVisible()
    await expect(ticket.getByText(/Service : Sage-femme/)).toBeVisible()
    for (const r of reponses) expect(r.texte, r.url).not.toMatch(SENSIBLE)
    await ticket.getByRole('button', { name: 'Fermer', exact: true }).first().click()
    await expect(
      page.getByRole('listitem').filter({ hasText: 'SUIVI Rokhaya' }).getByText('Arrivé'),
    ).toBeVisible()
    expect(erreurs).toEqual([])
  })

  for (const [role, compte, medical] of ROLES.filter(([r]) => r !== 'owner')) {
    test(`planning imprimé — ${role}`, async ({ page }) => {
      const erreurs = surveillerConsole(page)
      await page.addInitScript(() => {
        window.print = () => {}
      })
      await connecter(page, compte)
      await page.goto(`/app/rendez-vous?date=${ajouterJours(aujourdhui(), 1)}`)
      await page.getByRole('button', { name: 'Imprimer le planning' }).click()
      const fenetre = page.getByRole('dialog', { name: 'Imprimer le planning' })
      const papier = page.locator('.planning-imprime')
      if (medical) {
        await expect(fenetre.getByLabel(/Version neutre/)).toBeChecked()
      } else {
        await expect(fenetre.getByLabel(/Version soignant/)).toHaveCount(0)
      }
      await verifierEcran(page, `planning-fenetre-${role}`)
      await expect(papier).toContainText('SUIVI Mariama')
      expect(await papier.textContent()).not.toMatch(/Planification|Pilule|Document confidentiel/)
      await fenetre.getByRole('button', { name: 'Imprimer' }).click()
      await page.pdf({ path: `${CAPTURES}planning-${role}-neutre.pdf`, format: 'A4' })
      if (medical) {
        await fenetre.getByText('Version soignant (types réels)').click()
        await expect(papier).toContainText('Planification familiale')
        await expect(papier).toContainText('Document confidentiel')
        await fenetre.getByRole('button', { name: 'Imprimer' }).click()
        await page.pdf({ path: `${CAPTURES}planning-${role}-soignant.pdf`, format: 'A4' })
      }
      expect(erreurs).toEqual([])
    })
  }
})
