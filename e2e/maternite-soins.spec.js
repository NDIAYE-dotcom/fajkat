// Maternité, partie B2 : soins de la CPN, Td, conseils et examens, sur le serveur et la base
// locaux. Données créées par ce fichier (patientes « SOINS … » du Poste de santé Test).
//   - 360, 768 et 1440 px, sage-femme : soins de la CPN (fer, SP), « Ajouter à
//     l'ordonnance » sans doublon (deux clics, rechargement), « Sous cotrimoxazole » qui
//     bloque la SP et rend la CPN sensible, Td fait pendant la CPN, conseil, lecture de la
//     CPN validée ; onglet Grossesse : soins, Td d'après le carnet au mois (« mars 2024 »),
//     conseils, examens « À faire » puis résultat d'un laboratoire extérieur ;
//   - aide-soignant : onglet Grossesse sans conseils, sans examens, sans situation ni
//     repère de datation (aucun titre vide, aucun « réservé »), soins et Td en lecture ;
//     sage-femme : repère « Datation à vérifier (fusion) » levé par « J'ai vérifié ».
import { expect, test } from '@playwright/test'
import { COMPTES } from './comptes.js'
import {
  ajouterJours,
  aujourdhui,
  connecter,
  ecrireBase,
  LARGEURS,
  lireBase,
  surveillerConsole,
  textePdf,
  verifierEcran,
} from './outils.js'

const ORG = `(select id from public.organizations where name = 'Poste de santé Test')`
const TYPE_CPN = `(select id from public.encounter_types where org_id = ${ORG} and template_code = 'cpn')`
const TYPE_SOIN = (code) =>
  `(select id from public.maternal_intervention_types where org_id = ${ORG} and template_code = '${code}')`

// Patiente avec une grossesse ouverte il y a 140 jours (20 SA) ; renvoie [patient, grossesse].
function patienteEnceinte(prenom) {
  const id = ecrireBase(
    COMPTES.sageFemme,
    `with p as (insert into public.patients (org_id, last_name, first_name, sex, declared_age)
                values (${ORG}, 'SOINS', '${prenom}', 'F', 27) returning id)
     select id from p;`,
  )
  const g = ecrireBase(
    COMPTES.sageFemme,
    `select public.open_pregnancy('${id}', 'lmp', '${ajouterJours(aujourdhui(), -140)}'::date,
                                  null, null, null, 2, 1, 1);`,
  )
  return [id, g]
}

const commencerCpn = (patientId) =>
  ecrireBase(
    COMPTES.sageFemme,
    `select public.start_encounter('${patientId}', null, ${TYPE_CPN}) ->> 'id';`,
  )

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

// Case à cocher : clic sur son libellé, comme un utilisateur (Playwright attend que le libellé
// soit visible, stable et non recouvert, par exemple par la barre de navigation fixe du bas
// à 360 px), puis état vérifié.
async function cocher(caseACocher, etat = true) {
  if ((await caseACocher.isChecked()) === etat) return
  await caseACocher.locator('xpath=ancestor::label[1]').click()
  await expect(caseACocher).toBeChecked({ checked: etat })
}

async function validerConsultation(page) {
  await page.getByRole('button', { name: 'Valider la consultation' }).click()
  await page
    .getByRole('dialog', { name: 'Valider la consultation ?' })
    .getByRole('button', { name: 'Valider la consultation' })
    .click()
}

for (const largeur of LARGEURS) {
  test.describe(`${largeur} px`, () => {
    test.use({ viewport: { width: largeur, height: 900 } })

    test('sage-femme : soins de la CPN, ordonnance, cotrimoxazole, onglet Grossesse', async ({
      page,
    }) => {
      // Long parcours (Td, CPN, PDF, examens) : 2 minutes sous la charge de 4 workers.
      test.setTimeout(120 * 1000)
      const erreurs = surveillerConsole(page)
      const [id] = patienteEnceinte(`Awa${largeur}`)
      await connecter(page, COMPTES.sageFemme)

      // Td 1 d'après le carnet, qui ne donne que le mois : affiché « mars 2024 ».
      await page.goto(`/app/patients/${id}?onglet=grossesse`)
      const td = page.locator('.vaccin-td')
      await td.getByRole('button', { name: 'Noter un Td d’après le carnet' }).click()
      const carnet = page.getByRole('dialog', { name: 'Noter un Td d’après le carnet' })
      await carnet.locator('#td-carnet-precision').selectOption('month')
      await carnet.getByRole('button', { name: 'Noter la dose' }).click()
      await expect(carnet.getByText('Tapez l’année en quatre chiffres')).toBeVisible()
      await carnet.locator('#td-carnet-mois').selectOption({ label: 'mars' })
      await carnet.locator('#td-carnet-annee').fill('2024')
      await carnet.locator('#td-carnet-lieu').fill('Centre de santé de Kolda')
      await verifierEcran(page, 'soins-td-carnet')
      await carnet.getByRole('button', { name: 'Noter la dose' }).click()
      await expect(carnet).toHaveCount(0)
      await expect(td.locator('.vaccin-td__ligne', { hasText: 'Td 1' })).toContainText('mars 2024')
      // Délai déjà passé : « possible dès aujourd'hui », pas une date de 2024.
      await expect(td).toContainText('Td 2 possible dès aujourd’hui.')
      await expect(td.getByText('Aucune dose notée.')).toHaveCount(0)

      const consultation = commencerCpn(id)
      await page.goto(`/app/consultations/${consultation}`)
      // Motif pré-rempli, modifiable.
      const motif = page.getByRole('textbox', { name: /^Motif de consultation/ })
      await expect(motif).toHaveValue('Suivi de grossesse — CPN 1')
      await motif.fill('CPN 2')

      const soins = page.locator('.soins-cpn')
      await expect(soins.getByText('Soins préventifs')).toBeVisible()
      const sp = soins.locator('.soins-cpn-liste__ligne', { hasText: 'SP 1' })
      await cocher(soins.getByRole('checkbox', { name: /^Fer et acide folique/ }))
      await cocher(sp.getByRole('checkbox'))

      // « Ajouter à l'ordonnance » : une seule ligne, même après rechargement.
      await sp.getByRole('button', { name: 'Ajouter à l’ordonnance' }).click()
      await expect(sp.getByText('Dans l’ordonnance')).toBeVisible()
      await expect(sp.getByRole('button', { name: 'Ajouter à l’ordonnance' })).toHaveCount(0)
      await expect(page.locator('.ligne-ordonnance')).toHaveCount(1)
      // Quantité calculée (3 comprimés), jamais présentée comme modifiée à la main.
      await expect(
        page.locator('.ligne-ordonnance').getByText(/(Modifiée|Saisie) à la main/),
      ).toHaveCount(0)
      // Rechargement après l'enregistrement automatique (au plus 10 s), comme un soignant.
      await expect(page.getByText(/^Enregistré à \d\d:\d\d$/)).toBeVisible({ timeout: 30000 })
      await page.reload()
      await expect(page.locator('.ligne-ordonnance')).toHaveCount(1)
      await expect(
        page.locator('.soins-cpn-liste__ligne', { hasText: 'SP 1' }).getByText('Dans l’ordonnance'),
      ).toBeVisible()
      await verifierEcran(page, 'soins-cpn-saisie')

      // Sous cotrimoxazole : SP bloquée (message de la table), CPN sensible d'office ; la
      // ligne déjà dans l'ordonnance passe en rouge, plus aucun « Ajouter » ni tampon.
      await cocher(soins.getByRole('checkbox', { name: 'Sous cotrimoxazole' }))
      await expect(soins.getByText(/Pas de SP pour une patiente sous cotrimoxazole/)).toBeVisible()
      await expect(page.getByRole('checkbox', { name: /Consultation sensible/ })).toBeChecked()
      await expect(page.getByRole('checkbox', { name: /Consultation sensible/ })).toBeDisabled()
      await expect(sp.getByText('Dans l’ordonnance', { exact: true })).toHaveCount(0)
      await expect(sp.getByRole('button', { name: 'Ajouter à l’ordonnance' })).toHaveCount(0)
      await expect(sp.getByText(/encore dans l’ordonnance/)).toBeVisible()
      const ligneSp = page.locator('.ligne-ordonnance--bloquee')
      await expect(ligneSp).toContainText('Retirez cette ligne de l’ordonnance.')
      await verifierEcran(page, 'soins-cpn-cotrimoxazole')
      // Validation refusée tant que la ligne reste.
      await page.getByRole('button', { name: 'Valider la consultation' }).click()
      await expect(page.getByText('Corrigez les cases signalées avant de valider.')).toBeVisible()
      await expect(page.getByRole('dialog', { name: 'Valider la consultation ?' })).toHaveCount(0)
      await cocher(sp.getByRole('checkbox'), false)
      await ligneSp.getByRole('button', { name: 'Retirer la ligne' }).click()
      await expect(page.locator('.ligne-ordonnance')).toHaveCount(0)
      await soins
        .locator('.soins-cpn-liste__ligne', { hasText: 'Fer et acide folique' })
        .getByRole('button', { name: 'Ajouter à l’ordonnance' })
        .click()

      // Prescrire n'est pas donner : un soin ajouté à l'ordonnance n'est pas coché d'office.
      const deparasitage = soins.locator('.soins-cpn-liste__ligne', { hasText: 'Déparasitage' })
      await deparasitage.getByRole('button', { name: 'Ajouter à l’ordonnance' }).click()
      await expect(
        deparasitage.getByText('Dans l’ordonnance — cochez le soin s’il est donné aujourd’hui.'),
      ).toBeVisible()
      await expect(deparasitage.getByRole('checkbox')).not.toBeChecked()

      // Td 2 pendant la CPN, un conseil.
      await cocher(soins.getByRole('checkbox', { name: 'Td 2 faite pendant cette CPN' }))
      await soins.locator('#soins-cpn-lot').fill('L-2026-10')
      await cocher(soins.getByRole('checkbox', { name: 'Alimentation et repos' }))
      await validerConsultation(page)
      const lecture = page.locator('.lecture-soins-cpn')
      await expect(lecture).toContainText('Fer et acide folique')
      await expect(lecture).not.toContainText('SP 1')
      await expect(lecture).toContainText('Td 2 · lot L-2026-10')
      await expect(lecture).toContainText('Alimentation et repos')
      await expect(lecture).toContainText('Sous cotrimoxazole : cochée ce jour')
      await verifierEcran(page, 'soins-cpn-validee')

      // Ordonnance imprimée : jamais la situation.
      await page.getByRole('button', { name: 'Imprimer l’ordonnance' }).click()
      const impression = page.getByRole('dialog', { name: 'Imprimer l’ordonnance' })
      await expect(impression.getByRole('button', { name: 'Imprimer' })).toBeEnabled({
        timeout: 30000,
      })
      const telechargement = page.waitForEvent('download')
      await impression.getByRole('link', { name: 'Télécharger' }).click()
      const pdf = `e2e/captures/soins-ordonnance-${largeur}.pdf`
      await (await telechargement).saveAs(pdf)
      const texte = textePdf(pdf)
      expect(texte).toContain('Fer + acide folique')
      expect(texte).not.toMatch(/cotrimoxazole|sulfadoxine/i)
      await impression.getByRole('button', { name: 'Fermer' }).click()

      // Onglet Grossesse.
      await page.goto(`/app/patients/${id}?onglet=grossesse`)
      await expect(td.locator('.vaccin-td__ligne', { hasText: 'Td 1' })).toContainText('mars 2024')
      await expect(td.locator('.vaccin-td__ligne', { hasText: 'Td 2' })).toContainText('Ici')
      await expect(td).not.toContainText('01/03/2024')
      await expect(page.locator('.soins-grossesse').first()).toContainText('Fer et acide folique')
      await expect(page.getByRole('heading', { name: 'Conseils donnés' })).toBeVisible()

      const examens = page.locator('.examens-grossesse')
      await expect(
        examens.locator('.examens-grossesse__examen', { hasText: 'TDR VIH' }),
      ).toContainText('À faire')
      await examens.getByRole('button', { name: 'Noter un résultat d’un laboratoire' }).click()
      const fenetre = page.getByRole('dialog', { name: 'Noter un résultat d’un laboratoire' })
      await fenetre.getByRole('button', { name: 'Noter le résultat' }).click()
      await expect(fenetre.getByText('Choisissez l’examen.')).toBeVisible()
      await fenetre
        .locator('#resultat-exterieur-examen')
        .selectOption({ label: 'Hémoglobine (Hemocue)' })
      await fenetre
        .locator('#resultat-exterieur-date')
        .fill(ajouterJours(aujourdhui(), -3).split('-').reverse().join(''))
      await fenetre.locator('#resultat-exterieur-labo').fill('Laboratoire Bio 24')
      await fenetre.locator('#resultat-exterieur-valeur').fill('10,5')
      await verifierEcran(page, 'soins-resultat-exterieur')
      await fenetre.getByRole('button', { name: 'Noter le résultat' }).click()
      await expect(fenetre).toHaveCount(0)
      await expect(
        examens.locator('.examens-grossesse__examen', { hasText: 'Hémoglobine' }),
      ).toContainText('Résultat externe · Laboratoire Bio 24')
      await verifierEcran(page, 'soins-onglet-grossesse')
      expect(erreurs).toEqual([])
    })
  })
}

test('aide-soignant : ni conseils, ni examens, ni situation ; repère de datation', async ({
  page,
  browser,
}) => {
  const erreurs = surveillerConsole(page)
  const [id, g] = patienteEnceinte('Bineta')
  const conseil = lireBase(
    `select id from public.anc_counselling_topics where org_id = ${ORG} and template_code = 'pf_post_partum'`,
  )
  const typeFer = lireBase(`select ${TYPE_SOIN('fer_acide_folique')}`)
  cpnValidee(id, {
    reason: 'CPN',
    maternite: {
      conditions: ['cotrimoxazole'],
      interventions: [{ type_id: typeFer, note: 'Note de soin' }],
      counselling: [conseil],
    },
  })
  lireBase(`update public.pregnancies set dating_review_since = now() where id = '${g}'`)

  await connecter(page, COMPTES.aideSoignant)
  await page.goto(`/app/patients/${id}?onglet=grossesse`)
  await expect(page.locator('.soins-grossesse').first()).toContainText('Fer et acide folique')
  await expect(page.locator('.vaccin-td').getByText('Aucune dose notée.')).toHaveCount(1)
  const onglet = page.locator('.onglet-grossesse')
  for (const texte of [
    'Conseils donnés',
    'Planification familiale',
    'Examens de la grossesse',
    'cotrimoxazole',
    'Pas de SP',
    'Datation à vérifier',
    'Note de soin',
    'éservé',
  ]) {
    await expect(onglet.getByText(texte)).toHaveCount(0)
  }
  await expect(
    page.getByRole('button', { name: /Noter un Td|Noter un soin|Noter un résultat/ }),
  ).toHaveCount(0)
  await verifierEcran(page, 'soins-aide-soignant')

  // Sage-femme : repère « Datation à vérifier (fusion) », levé après vérification.
  const sageFemme = await (await browser.newContext()).newPage()
  const erreursSf = surveillerConsole(sageFemme)
  await connecter(sageFemme, COMPTES.sageFemme)
  await sageFemme.goto(`/app/patients/${id}?onglet=grossesse`)
  const repere = sageFemme.getByText('Datation à vérifier (fusion)')
  await expect(repere).toBeVisible()
  await expect(sageFemme.getByRole('heading', { name: 'Conseils donnés' })).toBeVisible()
  await sageFemme.getByRole('button', { name: 'J’ai vérifié la datation' }).click()
  await expect(repere).toHaveCount(0)
  expect(erreurs).toEqual([])
  expect(erreursSf).toEqual([])
})

test('consultation ordinaire d’une patiente sous cotrimoxazole : SP en rouge, validation refusée', async ({
  page,
}) => {
  const erreurs = surveillerConsole(page)
  const [id] = patienteEnceinte('Coumba')
  cpnValidee(id, { reason: 'CPN', maternite: { conditions: ['cotrimoxazole'] } })
  const typeConsultation = `(select id from public.encounter_types where org_id = ${ORG} and template_code = 'consultation')`
  const consultation = ecrireBase(
    COMPTES.sageFemme,
    `select public.start_encounter('${id}', null, ${typeConsultation}) ->> 'id';`,
  )
  const brouillon = {
    reason: 'Fièvre',
    prescription: {
      note: '',
      items: [{ cle: 'a1', product_name: 'sulfadoxine + pyriméthamine', saisies: {} }],
    },
  }
  ecrireBase(
    COMPTES.sageFemme,
    `select public.save_encounter_draft('${consultation}', 1, '${JSON.stringify(brouillon)}'::jsonb);`,
  )
  await connecter(page, COMPTES.sageFemme)
  await page.goto(`/app/consultations/${consultation}`)
  const ligne = page.locator('.ligne-ordonnance--bloquee')
  await expect(ligne).toContainText('Pas de SP pour une patiente sous cotrimoxazole')
  await expect(page.locator('.soins-cpn')).toHaveCount(0)
  await page.getByRole('button', { name: 'Valider la consultation' }).click()
  await expect(page.getByText('Corrigez les cases signalées avant de valider.')).toBeVisible()
  await ligne.getByRole('button', { name: 'Retirer la ligne' }).click()
  await expect(page.locator('.ligne-ordonnance')).toHaveCount(0)
  await verifierEcran(page, 'soins-consultation-ordinaire')
  expect(erreurs).toEqual([])
})
