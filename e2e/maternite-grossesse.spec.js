// Maternité, partie A : suivi de grossesse sur le serveur et la base locaux. Données créées
// par ce fichier (patientes « GROSSESSE … » du Poste de santé Test).
//   - 360, 768 et 1440 px, sage-femme : ouverture du suivi depuis la fiche (DPA de contrôle
//     08/12/2026 pour une DDR au 01/03/2026, erreurs sous les cases), terme et DPA,
//     nouvelle datation par échographie retenue d'office, retour à la DDR, page Maternité ;
//   - aide-soignant : lecture seule ;
//   - owner (n'exerce pas), accueil, caissier : ni onglet, ni donnée de grossesse, à l'écran
//     comme dans les réponses de l'API ; patient homme : pas d'onglet ;
//   - réglages : sage-femme (page Maternité) et owner (Paramètres) changent la méthode,
//     exemple 06/12/2026 pour DDR + 280 jours.
import { expect, test } from '@playwright/test'
import { COMPTES } from './comptes.js'
import {
  ajouterJours,
  aujourdhui,
  connecter,
  ecrireBase,
  LARGEURS,
  lireBase,
  relever,
  surveillerConsole,
  verifierEcran,
} from './outils.js'

const ORG = `(select id from public.organizations where name = 'Poste de santé Test')`
const PRENOMS = { 360: 'Aïssatou', 768: 'Bineta', 1440: 'Coumba' }
const GROSSESSE = /get_pregnancy|list_patient_pregnancies|list_ongoing_pregnancies/

const fr = (iso) => iso.split('-').reverse().join('/')

// Nouvelle patiente « GROSSESSE <prenom> » ; renvoie son id.
function patiente(prenom, sexe = 'F') {
  return ecrireBase(
    COMPTES.sageFemme,
    `with p as (insert into public.patients (org_id, last_name, first_name, sex, declared_age,
                                              neighborhood)
                values (${ORG}, 'GROSSESSE', '${prenom}', '${sexe}', 27, 'Médina') returning id)
     select id from p;`,
  )
}

// Grossesse ouverte par la base, DDR il y a 10 semaines.
function ouvrir(id) {
  ecrireBase(
    COMPTES.sageFemme,
    `select public.open_pregnancy('${id}', 'lmp', '${ajouterJours(aujourdhui(), -70)}'::date,
                                  null, null, null, 2, 1, 1);`,
  )
}

for (const largeur of LARGEURS) {
  test.describe(`${largeur} px`, () => {
    test.use({ viewport: { width: largeur, height: 900 } })

    test('sage-femme : ouverture du suivi et datations', async ({ page }) => {
      const erreurs = surveillerConsole(page)
      const prenom = PRENOMS[largeur]
      const id = patiente(prenom)
      const ddr = ajouterJours(aujourdhui(), -70)
      await connecter(page, COMPTES.sageFemme)
      await page.goto(`/app/patients/${id}?onglet=grossesse`)
      await expect(page.getByRole('tab', { name: 'Grossesse', selected: true })).toBeVisible()
      await expect(page.getByText('Aucune grossesse suivie')).toBeVisible()
      await verifierEcran(page, 'grossesse-vide')

      await page.getByRole('button', { name: 'Ouvrir un suivi de grossesse' }).click()
      const fenetre = page.getByRole('dialog', { name: 'Ouvrir un suivi de grossesse' })
      // Cas de contrôle : Naegele.
      await fenetre.locator('#ouverture-grossesse-ddr').fill('01032026')
      await expect(fenetre.locator('.champs-datation__apercu')).toContainText('08/12/2026')
      await fenetre.locator('#ouverture-grossesse-ddr').fill(fr(ddr).replaceAll('/', ''))
      await expect(fenetre.locator('.champs-datation__apercu')).toContainText('10 SA')
      // Erreurs sous les cases.
      await fenetre.getByRole('button', { name: 'Ouvrir le suivi' }).click()
      await expect(fenetre.getByText('Indiquez le nombre de grossesses')).toBeVisible()
      await fenetre.locator('#ouverture-grossesse-gestite').fill('2')
      await fenetre.locator('#ouverture-grossesse-parite').fill('2')
      await fenetre.locator('#ouverture-grossesse-vivants').fill('1')
      await fenetre.getByRole('button', { name: 'Ouvrir le suivi' }).click()
      await expect(fenetre.getByText(/Au plus 1/)).toBeVisible()
      await fenetre.locator('#ouverture-grossesse-parite').fill('1')
      await fenetre.locator('#ouverture-grossesse-groupe').selectOption('O+')
      await verifierEcran(page, 'grossesse-ouverture')
      await fenetre.getByRole('button', { name: 'Ouvrir le suivi' }).click()

      const fiche = page.locator('.suivi-grossesse__fiche')
      await expect(fiche).toContainText('10 SA')
      const dpa = lireBase(
        `select d.edd from public.pregnancies g
           join public.pregnancy_datings d on d.id = g.current_dating_id
          where g.patient_id = '${id}' and g.deleted_at is null`,
      )
      await expect(fiche).toContainText(fr(dpa))
      await expect(fiche).toContainText('G2 P1 EV1')
      await expect(fiche).toContainText('O+')
      await verifierEcran(page, 'grossesse-en-cours')

      // Échographie d'aujourd'hui : 11 SA, retenue d'office ; puis retour à la DDR.
      await page.getByRole('button', { name: 'Nouvelle datation' }).click()
      const datation = page.getByRole('dialog', { name: 'Nouvelle datation' })
      await datation.locator('#nouvelle-datation-examen').fill(fr(aujourdhui()).replaceAll('/', ''))
      await datation.locator('#nouvelle-datation-semaines').fill('11')
      await datation.locator('#nouvelle-datation-jours').fill('0')
      await expect(datation.locator('.champs-datation__apercu')).toContainText(
        fr(ajouterJours(aujourdhui(), 280 - 77)),
      )
      // Écart avec la DDR retenue (10 SA) : 1 SA, affiché avant l'enregistrement.
      await expect(datation.locator('.champs-datation__apercu')).toContainText(
        'Écart avec la datation retenue : 1 SA',
      )
      await verifierEcran(page, 'grossesse-datation')
      await datation.getByRole('button', { name: 'Enregistrer la datation' }).click()
      await expect(fiche).toContainText('11 SA')
      const lignes = page.locator('.historique-datations__ligne')
      await expect(lignes).toHaveCount(2)
      await expect(lignes.first()).toContainText('Retenue')
      await expect(lignes.nth(1)).toContainText('Écart avec la datation retenue : 1 SA')
      await expect(lignes.first()).not.toContainText('Écart')
      await lignes.nth(1).getByRole('button', { name: 'Retenir cette datation' }).click()
      await expect(fiche).toContainText('10 SA')
      await expect(lignes.nth(1)).toContainText('Retenue')
      await expect(lignes.first()).toContainText('Écart avec la datation retenue : 1 SA')
      await verifierEcran(page, 'grossesse-historique')

      // Page Maternité : la patiente est listée et cherchable.
      await page.goto('/app/maternite')
      await page.getByRole('searchbox', { name: 'Rechercher une patiente suivie' }).fill(prenom)
      const ligne = page.getByRole('row').filter({ hasText: prenom })
      await expect(ligne).toContainText('10 SA')
      await expect(ligne).toContainText(fr(dpa))
      await verifierEcran(page, 'maternite-en-cours')
      await ligne.getByRole('link', { name: new RegExp(prenom) }).click()
      await expect(page.getByRole('tab', { name: 'Grossesse', selected: true })).toBeVisible()
      expect(erreurs).toEqual([])
    })

    test('aide-soignant : lecture seule', async ({ page }) => {
      const erreurs = surveillerConsole(page)
      const id = patiente(`Lecture${largeur}`)
      ouvrir(id)
      await connecter(page, COMPTES.aideSoignant)
      await page.goto(`/app/patients/${id}?onglet=grossesse`)
      await expect(page.locator('.suivi-grossesse__fiche')).toContainText('10 SA')
      for (const nom of ['Nouvelle datation', 'Gestité, parité, groupe', 'Retirer ce suivi']) {
        await expect(page.getByRole('button', { name: nom })).toHaveCount(0)
      }
      await expect(page.getByRole('button', { name: 'Retenir cette datation' })).toHaveCount(0)
      await verifierEcran(page, 'grossesse-aide-soignant')
      await page.goto('/app/maternite')
      await expect(page.getByRole('tab', { name: 'Grossesses en cours' })).toBeVisible()
      await expect(page.getByRole('tab', { name: 'Réglages' })).toHaveCount(0)
      expect(erreurs).toEqual([])
    })

    for (const [role, compte] of [
      ['owner', COMPTES.ownerPoste],
      ['accueil', COMPTES.accueil],
      ['caissier', COMPTES.caissier],
    ]) {
      test(`aucune donnée de grossesse — ${role}`, async ({ page }) => {
        const erreurs = surveillerConsole(page)
        const reponses = relever(page, /\/rest\/v1\//)
        const id = patiente(`Secret${role}${largeur}`)
        ouvrir(id)
        await connecter(page, compte)
        await page.goto(`/app/patients/${id}?onglet=grossesse`)
        await expect(page.getByRole('tab', { name: 'Identité', selected: true })).toBeVisible()
        await expect(page.getByRole('tab', { name: 'Grossesse' })).toHaveCount(0)
        await expect(page.locator('main')).not.toContainText(/\d+ SA|Grossesse en cours|G2 P1/)
        await verifierEcran(page, `grossesse-fiche-${role}`)

        await page.goto('/app/maternite')
        if (role === 'owner') {
          // Réglages seulement : la liste reste réservée aux soignants.
          await expect(
            page.getByText('Le suivi de grossesse est réservé aux soignants'),
          ).toBeVisible()
          await expect(page.getByRole('tab', { name: 'Réglages' })).toBeVisible()
        } else {
          await expect(page.getByText(/ne donne pas accès à « Maternité »/)).toBeVisible()
        }
        await verifierEcran(page, `maternite-${role}`)
        expect(reponses.filter((r) => GROSSESSE.test(r.url)).map((r) => r.url)).toEqual([])
        expect(reponses.filter((r) => /"(edd|ga_days|gravidity)"/.test(r.texte))).toEqual([])
        expect(erreurs).toEqual([])
      })
    }

    test('patient homme : pas d’onglet Grossesse', async ({ page }) => {
      const erreurs = surveillerConsole(page)
      const id = patiente(`Homme${largeur}`, 'M')
      await connecter(page, COMPTES.sageFemme)
      await page.goto(`/app/patients/${id}?onglet=grossesse`)
      await expect(page.getByRole('tab', { name: 'Identité', selected: true })).toBeVisible()
      await expect(page.getByRole('tab', { name: 'Grossesse' })).toHaveCount(0)
      expect(erreurs).toEqual([])
    })

    test('réglages : sage-femme dans la page Maternité', async ({ page }) => {
      const erreurs = surveillerConsole(page)
      await connecter(page, COMPTES.sageFemme)
      await page.goto('/app/maternite?onglet=reglages')
      const exemple = page.locator('.reglages-maternite__exemple')
      await expect(exemple).toContainText('08/12/2026')
      await page.getByRole('radio', { name: /DDR \+ durée de la grossesse/ }).check()
      await expect(exemple).toContainText('06/12/2026')
      await page.locator('#reglages-maternite-duree').fill('9')
      await page.getByRole('button', { name: 'Enregistrer les modifications' }).click()
      await expect(page.getByText('Tapez un nombre de jours, de 250 à 310.')).toBeVisible()
      await page.locator('#reglages-maternite-duree').fill('280')
      await verifierEcran(page, 'maternite-reglages')
      await page.getByRole('button', { name: 'Enregistrer les modifications' }).click()
      await expect(page.getByText('Maternité : modifications enregistrées')).toBeVisible()
      expect(
        lireBase(`select edd_method from public.maternity_settings where org_id = ${ORG}`),
      ).toBe('plus_days')

      expect(erreurs).toEqual([])
    })

    // Owner : Paramètres → Maternité, retour à Naegele (le test précédent a réglé DDR + 280).
    test('réglages : owner dans Paramètres', async ({ page }) => {
      const erreurs = surveillerConsole(page)
      await connecter(page, COMPTES.ownerPoste)
      await page.goto('/app/parametres?onglet=maternite')
      await expect(page.locator('.reglages-maternite__exemple')).toContainText('06/12/2026')
      await page.getByRole('radio', { name: /Règle de Naegele/ }).check()
      await verifierEcran(page, 'parametres-maternite')
      await page.getByRole('button', { name: 'Enregistrer les modifications' }).click()
      await expect(page.getByText('Maternité : modifications enregistrées')).toBeVisible()
      expect(
        lireBase(`select edd_method from public.maternity_settings where org_id = ${ORG}`),
      ).toBe('naegele')
      expect(erreurs).toEqual([])
    })
  })
}
