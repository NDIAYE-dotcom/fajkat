// Maternité, partie B1 : CPN sur le serveur et la base locaux. Données créées par ce
// fichier (patientes « CPN … » du Poste de santé Test).
//   - 360, 768 et 1440 px, sage-femme : consultation CPN d'une femme dont la grossesse
//     n'est pas ouverte (suivi ouvert dans la consultation, saisie gardée), erreur sous la
//     case, validation, lecture, prochaine CPN pré-remplie dans « Prochain rendez-vous »,
//     tableau des CPN et CPN faite ailleurs (numéro par date), retrait motivé ;
//   - aide-soignant : mêmes champs pour une CPN sensible et une CPN ordinaire (ni remarque,
//     ni lien), aucune consultation de maternité dans la chronologie, lecture seule ;
//   - réglages : sage-femme (page Maternité) change le modèle de CPN et ajoute un choix à
//     une liste ; owner (paramètres de l'agenda) : « Nommer le type dans le rappel »,
//     impossible pour un type discret.
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
const TYPE_CPN = `(select id from public.encounter_types where org_id = ${ORG} and template_code = 'cpn')`

const fr = (iso) => iso.split('-').reverse().join('/')
const saisieDate = (iso) => fr(iso).replaceAll('/', '')

function patiente(prenom) {
  return ecrireBase(
    COMPTES.sageFemme,
    `with p as (insert into public.patients (org_id, last_name, first_name, sex, declared_age,
                                              neighborhood)
                values (${ORG}, 'CPN', '${prenom}', 'F', 26, 'Médina') returning id)
     select id from p;`,
  )
}

// Consultation CPN commencée par la sage-femme (hors passage) ; renvoie son id.
function commencerCpn(patientId) {
  return ecrireBase(
    COMPTES.sageFemme,
    `select public.start_encounter('${patientId}', null, ${TYPE_CPN}) ->> 'id';`,
  )
}

// CPN validée par la base, avec ses mesures (brouillon puis validation).
function cpnValidee(patientId, brouillon) {
  const id = commencerCpn(patientId)
  ecrireBase(
    COMPTES.sageFemme,
    `select public.validate_encounter('${id}',
       (public.save_encounter_draft('${id}', 1, '${JSON.stringify(brouillon)}'::jsonb)
         ->> 'version')::integer);`,
  )
  return id
}

for (const largeur of LARGEURS) {
  test.describe(`${largeur} px`, () => {
    test.use({ viewport: { width: largeur, height: 900 } })

    test('sage-femme : première CPN, suivi ouvert dans la consultation', async ({ page }) => {
      const erreurs = surveillerConsole(page)
      const id = patiente(`Premiere${largeur}`)
      const consultation = commencerCpn(id)
      const ddr = ajouterJours(aujourdhui(), -140)
      await connecter(page, COMPTES.sageFemme)
      await page.goto(`/app/consultations/${consultation}`)

      const section = page.locator('.section-cpn')
      await expect(section.getByText('Aucune grossesse suivie pour cette patiente')).toBeVisible()
      // Saisie commencée avant l'ouverture du suivi : rien ne doit se perdre.
      await page.getByRole('textbox', { name: /^Motif de consultation/ }).fill('CPN 1')
      await section.locator('#section-cpn-hauteur').fill('80')
      await page.getByRole('button', { name: 'Valider la consultation' }).click()
      await expect(section.getByText('Hauteur utérine : de 5 à 50 cm.')).toBeVisible()
      await expect(section.getByText(/Ouvrez le suivi de grossesse avant de valider/)).toBeVisible()
      await verifierEcran(page, 'cpn-sans-grossesse')

      await section.getByRole('button', { name: 'Ouvrir le suivi de grossesse' }).click()
      const fenetre = page.getByRole('dialog', { name: 'Ouvrir un suivi de grossesse' })
      await fenetre.locator('#ouverture-grossesse-ddr').fill(saisieDate(ddr))
      await fenetre.locator('#ouverture-grossesse-gestite').fill('1')
      await fenetre.locator('#ouverture-grossesse-parite').fill('0')
      await fenetre.locator('#ouverture-grossesse-vivants').fill('0')
      await fenetre.getByRole('button', { name: 'Ouvrir le suivi' }).click()
      await expect(fenetre).toHaveCount(0)
      await expect(section.locator('.repere-cpn')).toContainText('n° 1')
      await expect(section.locator('.repere-cpn')).toContainText('20 SA')
      await expect(page.getByRole('textbox', { name: /^Motif de consultation/ })).toHaveValue(
        'CPN 1',
      )
      await expect(section.locator('#section-cpn-hauteur')).toHaveValue('80')

      await section.locator('#section-cpn-hauteur').fill('18,5')
      await section.getByRole('radio', { name: 'Perçus', exact: true }).check()
      await section.locator('#section-cpn-frequence').fill('142')
      await section.locator('#section-cpn-presentation').selectOption({ label: 'Céphalique' })
      await section.locator('#section-cpn-proteinuria').selectOption({ label: 'Traces' })
      await verifierEcran(page, 'cpn-saisie')

      await page.getByRole('button', { name: 'Valider la consultation' }).click()
      await page
        .getByRole('dialog', { name: 'Valider la consultation ?' })
        .getByRole('button', { name: 'Valider la consultation' })
        .click()
      const lecture = page.locator('.lecture-cpn')
      await expect(lecture).toContainText('18,5 cm')
      await expect(lecture).toContainText('Perçus · 142/min')
      await expect(lecture).toContainText('Céphalique')
      await verifierEcran(page, 'cpn-validee')

      // Prochaine CPN pré-remplie : type CPN et date attendue (contact 2 du modèle).
      await page.getByRole('button', { name: 'Prochain rendez-vous' }).click()
      const rdv = page.getByRole('dialog', { name: 'Prochain rendez-vous' })
      await expect(rdv.getByText(/CPN 2 attendue vers le/)).toBeVisible()
      const typeRdv = lireBase(
        `select id from public.appointment_types where org_id = ${ORG} and template_code = 'cpn'`,
      )
      await expect(rdv.getByRole('combobox', { name: /Type de rendez-vous/ })).toHaveValue(typeRdv)
      await verifierEcran(page, 'cpn-prochain-rdv')
      await rdv.getByRole('button', { name: 'Fermer', exact: true }).first().click()

      // Tableau des CPN, puis CPN faite ailleurs avant celle-ci : elle devient la n° 1.
      await page.goto(`/app/patients/${id}?onglet=grossesse`)
      const tableau = page.locator('.tableau-cpn')
      await expect(tableau.locator('.tableau-cpn__fiche', { hasText: 'CPN 1' })).toContainText(
        'Ici',
      )
      await expect(tableau).toContainText('1 CPN faite')
      await tableau.getByRole('button', { name: 'Noter une CPN faite ailleurs' }).click()
      const ailleurs = page.getByRole('dialog', { name: 'Noter une CPN faite ailleurs' })
      await ailleurs.getByRole('button', { name: 'Noter la CPN' }).click()
      await expect(ailleurs.getByText('Indiquez la date de la CPN')).toBeVisible()
      await ailleurs.locator('#cpn-ailleurs-date').fill(saisieDate(ajouterJours(aujourdhui(), -60)))
      await ailleurs.locator('#cpn-ailleurs-lieu').fill('Centre de santé de Kolda')
      await verifierEcran(page, 'cpn-ailleurs')
      await ailleurs.getByRole('button', { name: 'Noter la CPN' }).click()
      await expect(ailleurs).toHaveCount(0)
      await expect(tableau.locator('.tableau-cpn__fiche', { hasText: 'CPN 1' })).toContainText(
        'Centre de santé de Kolda',
      )
      await expect(tableau.locator('.tableau-cpn__fiche', { hasText: 'CPN 2' })).toContainText(
        'Ici',
      )
      await expect(tableau).toContainText('2 CPN faites')
      await verifierEcran(page, 'cpn-tableau')

      // Retrait motivé de la CPN notée d'après le carnet.
      await tableau
        .locator('.tableau-cpn__fiche', { hasText: 'CPN 1' })
        .getByRole('button', { name: 'Retirer' })
        .click()
      const retrait = page.getByRole('dialog', { name: 'Retirer la CPN 1 ?' })
      await retrait.getByRole('button', { name: 'Retirer' }).click()
      await expect(retrait.getByText('Indiquez pourquoi cette CPN est retirée.')).toBeVisible()
      await retrait.getByRole('textbox', { name: /Motif/ }).fill('Date mal lue')
      await retrait.getByRole('button', { name: 'Retirer' }).click()
      await expect(retrait).toHaveCount(0)
      await expect(tableau.locator('.tableau-cpn__fiche', { hasText: 'CPN 1' })).toContainText(
        'Ici',
      )
      expect(erreurs).toEqual([])
    })

    test('aide-soignant : CPN sensible indiscernable, chronologie sans maternité', async ({
      page,
    }) => {
      const erreurs = surveillerConsole(page)
      const reponses = relever(page, /\/rest\/v1\/rpc\/(list_anc_visits|patient_timeline)/)
      const id = patiente(`Discrete${largeur}`)
      ecrireBase(
        COMPTES.sageFemme,
        `select public.open_pregnancy('${id}', 'lmp', '${ajouterJours(aujourdhui(), -150)}'::date,
                                      null, null, null, 2, 1, 1);`,
      )
      cpnValidee(id, { reason: 'CPN', maternite: { fundal_height_cm: 20, note: 'Note ordinaire' } })
      cpnValidee(id, {
        reason: 'CPN',
        is_sensitive: true,
        maternite: { fundal_height_cm: 21, note: 'Note sensible' },
      })
      await connecter(page, COMPTES.aideSoignant)
      await page.goto(`/app/patients/${id}?onglet=grossesse`)
      const tableau = page.locator('.tableau-cpn')
      const ordinaire = tableau.locator('.tableau-cpn__fiche', { hasText: 'CPN 1' })
      const sensible = tableau.locator('.tableau-cpn__fiche', { hasText: 'CPN 2' })
      await expect(ordinaire).toContainText('20 cm')
      await expect(sensible).toContainText('21 cm')
      // Mêmes cases, rien qui les distingue.
      const cellules = async (ligne) =>
        (await ligne.locator('span, dd').allInnerTexts()).map((t) =>
          t.replace(/\d+([,.]\d+)?/g, '#'),
        )
      expect(await cellules(sensible)).toEqual(await cellules(ordinaire))
      await expect(tableau.getByRole('link', { name: 'Voir la consultation' })).toHaveCount(0)
      await expect(
        tableau.getByRole('button', { name: 'Noter une CPN faite ailleurs' }),
      ).toHaveCount(0)
      await expect(page.locator('main')).not.toContainText(/Note ordinaire|Note sensible/)
      await verifierEcran(page, 'cpn-aide-soignant')

      await page.goto(`/app/patients/${id}?onglet=chronologie`)
      await expect(page.getByRole('tab', { name: 'Chronologie', selected: true })).toBeVisible()
      await page.waitForLoadState('networkidle')
      await expect(page.locator('main')).not.toContainText(/Consultation prénatale/)
      expect(
        reponses.filter((r) => /Note (ordinaire|sensible)|encounter_id":"[0-9a-f]/.test(r.texte)),
      ).toEqual([])
      expect(erreurs).toEqual([])
    })

    test('réglages : modèle de CPN et listes (sage-femme)', async ({ page }) => {
      const erreurs = surveillerConsole(page)
      await connecter(page, COMPTES.sageFemme)
      await page.goto('/app/maternite?onglet=reglages')
      await page.getByRole('radio', { name: /8 contacts \(OMS\)/ }).check()
      await page
        .getByRole('button', { name: /Enregistrer/ })
        .first()
        .click()
      await expect
        .poll(() =>
          lireBase(`select anc_model_code from public.maternity_settings where org_id = ${ORG}`),
        )
        .toBe('oms2016_8')
      const choix = `Visage ${largeur}`
      await page.getByRole('button', { name: 'Ajouter un choix (œdèmes)' }).click()
      const nouveau = page.getByRole('region', { name: 'Nouveau choix : œdèmes' })
      await nouveau.getByRole('textbox', { name: /Libellé/ }).fill(choix)
      await nouveau.getByRole('button', { name: 'Ajouter' }).click()
      await expect(page.getByRole('region', { name: 'Œdèmes', exact: true })).toContainText(choix)
      await verifierEcran(page, 'cpn-reglages')
      // Retour au modèle des postes.
      await page.getByRole('radio', { name: /^4 CPN/ }).check()
      await page
        .getByRole('button', { name: /Enregistrer/ })
        .first()
        .click()
      await expect
        .poll(() =>
          lireBase(`select anc_model_code from public.maternity_settings where org_id = ${ORG}`),
        )
        .toBe('cpn4')
      expect(erreurs).toEqual([])
    })
  })
}

test.describe('1440 px', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('owner : « Nommer le type dans le rappel », jamais pour un type discret', async ({
    page,
  }) => {
    const erreurs = surveillerConsole(page)
    await connecter(page, COMPTES.ownerPoste)
    await page.goto('/app/rendez-vous/parametres?onglet=types')
    const liste = page.getByRole('region', { name: 'Types de rendez-vous' })
    const vaccination = liste.getByRole('listitem').filter({ hasText: /^Vaccination/ })
    await vaccination.getByRole('button', { name: 'Modifier' }).click()
    const nommer = liste.getByRole('checkbox', { name: /Nommer le type dans le rappel/ })
    await expect(nommer).not.toBeChecked()
    await nommer.check({ force: true })
    // Type discret coché : la case se décoche et se bloque.
    await liste.getByRole('checkbox', { name: /Type discret/ }).check({ force: true })
    await expect(nommer).not.toBeChecked()
    await expect(nommer).toBeDisabled()
    await liste.getByRole('checkbox', { name: /Type discret/ }).uncheck({ force: true })
    await nommer.check({ force: true })
    await verifierEcran(page, 'cpn-type-rappel')
    await liste.getByRole('button', { name: 'Enregistrer' }).click()
    await expect(liste).toContainText('nommé dans le rappel')
    expect(
      lireBase(
        `select name_in_reminder from public.appointment_types
          where org_id = ${ORG} and template_code = 'vaccination'`,
      ),
    ).toBe('t')
    // Remis comme avant.
    await liste
      .getByRole('listitem')
      .filter({ hasText: /^Vaccination/ })
      .getByRole('button', { name: 'Modifier' })
      .click()
    await liste
      .getByRole('checkbox', { name: /Nommer le type dans le rappel/ })
      .uncheck({ force: true })
    await liste.getByRole('button', { name: 'Enregistrer' }).click()
    await expect(liste).not.toContainText('nommé dans le rappel')
    expect(erreurs).toEqual([])
  })
})
