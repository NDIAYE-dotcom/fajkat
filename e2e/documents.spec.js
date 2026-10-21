// Parcours des documents de la consultation (étape 14, partie E), sur le serveur et la base
// locaux. Données : e2e/donnees.sql (patients « DOC … »).
//   - 360, 768 et 1440 px : page Références, fenêtres de la lettre et du certificat ;
//   - lettre de référence pré-remplie (motif, examen, conduite, traitements), émise et
//     imprimée en A4 ; consultation sensible : pli confidentiel ;
//   - certificats : repos complété (patient, jours, dates), « …… » à compléter, numéro,
//     aucun contenu médical dans le texte émis ;
//   - prochain rendez-vous depuis la consultation, puis ordonnance qui l'imprime ;
//     rendez-vous de PF : « Consultation » pour l'accueil ;
//   - page Références : retard, pli confidentiel, contre-référence ;
//   - Paramètres → Références et Certificats (owner qui n'exerce pas) ;
//   - coupure : saisie de la lettre gardée sur l'appareil ;
//   - accueil, caissier, comptable, owner qui n'exerce pas : ni menu, ni contenu à l'écran
//     ni dans les réponses réseau ; aide-soignant : aucun document.
// PDF téléchargés dans e2e/captures, convertis en image pour relecture.
import { execFileSync } from 'node:child_process'
import { expect, test } from '@playwright/test'
import { COMPTES } from './comptes.js'
import {
  connecter,
  ecrireBase,
  LARGEURS,
  lireBase,
  relever,
  surveillerConsole,
  verifierEcran,
} from './outils.js'

const CAPTURES = new URL('./captures/', import.meta.url).pathname
// Contenu des références et des certificats, jamais chez les rôles non médicaux.
const CONTENU =
  /Suspicion d.appendicite|Retrait d.implant|CERT-20\d\d|Toux et fièvre|Râles|Appendicite aiguë|counter_diagnosis/

const consultationDe = (prenom) =>
  lireBase(`select e.id from public.encounters e join public.patients p on p.id = e.patient_id
             where p.last_name = 'DOC' and p.first_name = '${prenom}' and e.deleted_at is null
             order by e.created_at desc limit 1`)

function enImage(pdf) {
  try {
    execFileSync('sips', ['-s', 'format', 'png', pdf, '--out', pdf.replace(/\.pdf$/, '.png')], {
      stdio: 'ignore',
    })
  } catch {
    // Sans sips : le PDF reste dans e2e/captures.
  }
}

// Télécharge le PDF de la fenêtre d'impression ouverte, vérifie l'en-tête, le garde en image.
async function telechargerPdf(page, fenetre, nom) {
  await expect(fenetre.getByRole('button', { name: 'Imprimer' })).toBeEnabled({ timeout: 30000 })
  const telechargement = page.waitForEvent('download')
  await fenetre.getByRole('link', { name: 'Télécharger' }).click()
  const chemin = `${CAPTURES}${nom}.pdf`
  await (await telechargement).saveAs(chemin)
  expect(execFileSync('head', ['-c', '5', chemin], { encoding: 'utf8' })).toBe('%PDF-')
  enImage(chemin)
}

// Option d'une liste dont le libellé commence par « texte » (« Consultation (15 min) »).
async function choisir(select, debut) {
  const libelle = await select
    .locator('option', { hasText: new RegExp(`^${debut}`) })
    .first()
    .textContent()
  await select.selectOption({ label: libelle })
}

async function ouvrirConsultation(page, prenom) {
  await page.goto(`/app/consultations/${consultationDe(prenom)}`)
  await expect(page.getByRole('heading', { name: 'Documents' })).toBeVisible()
}

for (const largeur of LARGEURS) {
  test(`mise en page — ${largeur} px`, async ({ page }) => {
    await page.setViewportSize({ width: largeur, height: 900 })
    const erreurs = surveillerConsole(page)
    await connecter(page, COMPTES.infirmier)
    await page.goto('/app/references')
    await expect(page.getByText('DOC Ancienne')).toBeVisible()
    await verifierEcran(page, `references-${largeur}`)
    await ouvrirConsultation(page, 'Aissatou')
    await verifierEcran(page, `documents-consultation-${largeur}`)
    await page.getByRole('button', { name: 'Référer le patient' }).click()
    await expect(page.getByRole('dialog', { name: 'Référer le patient' })).toBeVisible()
    await verifierEcran(page, `reference-fenetre-${largeur}`)
    await page.getByRole('dialog').getByRole('button', { name: 'Fermer', exact: true }).click()
    await page.getByRole('button', { name: 'Certificat', exact: true }).click()
    const fenetre = page.getByRole('dialog', { name: 'Certificat' })
    await choisir(fenetre.getByRole('combobox', { name: /^Modèle/ }), 'Certificat de repos')
    await verifierEcran(page, `certificat-fenetre-${largeur}`)
    expect(erreurs).toEqual([])
  })
}

test.describe('1440 px', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('lettre de référence pré-remplie, émise et imprimée', async ({ page }) => {
    const erreurs = surveillerConsole(page)
    await connecter(page, COMPTES.infirmier)
    await ouvrirConsultation(page, 'Aissatou')
    await page.getByRole('button', { name: 'Référer le patient' }).click()
    const fenetre = page.getByRole('dialog', { name: 'Référer le patient' })
    await expect(fenetre.getByRole('textbox', { name: /^Résumé clinique/ })).toHaveValue(
      /Motif de consultation : Toux et fièvre depuis 4 jours[\s\S]*Examen clinique : Râles crépitants[\s\S]*Conduite tenue : Antibiotique/,
    )
    await expect(fenetre.getByRole('textbox', { name: /^Traitements reçus/ })).toHaveValue(
      'Amoxicilline 500 mg — 1 – 0 – 1 – 0, pendant 5 jours',
    )
    // Rien n'est envoyé sans destination ni motif.
    await fenetre.getByRole('button', { name: 'Émettre et imprimer la lettre' }).click()
    await expect(fenetre.getByText('Choisissez l’établissement de destination.')).toBeVisible()
    await expect(fenetre.getByText('Indiquez le motif de la référence.')).toBeVisible()
    await fenetre
      .getByRole('combobox', { name: /^Établissement de destination/ })
      .selectOption({ label: 'Hôpital régional de Kolda' })
    await fenetre
      .getByRole('textbox', { name: /^Motif de la référence/ })
      .fill('Pneumonie, détresse respiratoire')
    await fenetre.getByText('Référence urgente').click()
    await fenetre.getByRole('button', { name: 'Émettre et imprimer la lettre' }).click()

    const impression = page.getByRole('dialog', { name: 'Imprimer la lettre de référence' })
    await telechargerPdf(page, impression, 'reference-ordinaire')
    await verifierEcran(page, 'reference-impression')
    await impression.getByRole('button', { name: 'Fermer', exact: true }).click()
    const ligne = page.locator('.documents-consultation__ligne', {
      hasText: 'Référence vers Hôpital régional de Kolda',
    })
    await expect(ligne.getByText('En attente de retour')).toBeVisible()
    await expect(ligne.getByText('Urgent')).toBeVisible()
    expect(
      lireBase(`select r.urgency || '|' || (r.summary like 'Motif de consultation : Toux%')::text
                  from public.referrals r join public.patients p on p.id = r.patient_id
                 where p.first_name = 'Aissatou' and p.last_name = 'DOC'`),
    ).toBe('urgent|true')
    expect(erreurs).toEqual([])
  })

  test('consultation sensible : lettre en pli confidentiel', async ({ page }) => {
    const erreurs = surveillerConsole(page)
    await connecter(page, COMPTES.infirmier)
    await ouvrirConsultation(page, 'Ndella')
    await page.getByRole('button', { name: 'Référer le patient' }).click()
    const fenetre = page.getByRole('dialog', { name: 'Référer le patient' })
    await expect(fenetre.getByText(/« Pli confidentiel — à remettre au soignant »/)).toBeVisible()
    await fenetre
      .getByRole('combobox', { name: /^Établissement de destination/ })
      .selectOption({ label: 'Autre établissement (à écrire)' })
    await fenetre
      .getByRole('textbox', { name: /^Nom de l’autre établissement/ })
      .fill('Centre de santé de Vélingara')
    await fenetre.getByText('Ajouter cet établissement à la liste').click()
    await fenetre.getByRole('textbox', { name: /^Motif de la référence/ }).fill('Pose d’implant')
    await fenetre.getByRole('button', { name: 'Émettre et imprimer la lettre' }).click()
    const impression = page.getByRole('dialog', { name: 'Imprimer la lettre de référence' })
    await expect(impression.getByText(/Pli confidentiel\. Pliez la lettre en trois/)).toBeVisible()
    await telechargerPdf(page, impression, 'reference-sensible')
    // Établissement écrit sans l'ajouter à la liste : la liste ne change pas.
    expect(
      lireBase(`select count(*) from public.referral_destinations where name like '%Vélingara%'`),
    ).toBe('0')
    expect(erreurs).toEqual([])
  })

  test('certificats : repos complété, « …… » à compléter, numéro', async ({ page }) => {
    const erreurs = surveillerConsole(page)
    await connecter(page, COMPTES.infirmier)
    await ouvrirConsultation(page, 'Aissatou')
    await page.getByRole('button', { name: 'Certificat', exact: true }).click()
    let fenetre = page.getByRole('dialog', { name: 'Certificat' })
    await choisir(fenetre.getByRole('combobox', { name: /^Modèle/ }), 'Certificat de repos')
    await fenetre.getByRole('textbox', { name: /^Jours de repos/ }).fill('3')
    const texte = fenetre.getByRole('textbox', { name: /^Texte du certificat/ })
    await expect(texte).toHaveValue(
      /Je soussigné\(e\), Awa Faye, certifie avoir examiné ce jour DOC Aissatou, née vers \d{4}, dont/,
    )
    await expect(texte).toHaveValue(
      /repos de 3 jour\(s\), du \d\d\/\d\d\/\d{4} au \d\d\/\d\d\/\d{4} inclus/,
    )
    await expect(texte).not.toHaveValue(/Toux|Râles|Amoxicilline|\{/)
    await fenetre.getByRole('button', { name: 'Émettre et imprimer' }).click()
    let impression = page.getByRole('dialog', { name: 'Imprimer le certificat' })
    await expect(impression.getByText(/Certificat de repos n° CERT-\d{4}-0001/)).toBeVisible()
    await telechargerPdf(page, impression, 'certificat-repos')
    await impression.getByRole('button', { name: 'Fermer', exact: true }).click()
    await expect(
      page.locator('.documents-consultation__ligne', { hasText: 'n° CERT-' }),
    ).toHaveCount(1)

    // Aptitude : « …… » à compléter avant l'émission.
    await page.getByRole('button', { name: 'Certificat', exact: true }).click()
    fenetre = page.getByRole('dialog', { name: 'Certificat' })
    await choisir(fenetre.getByRole('combobox', { name: /^Modèle/ }), 'Certificat d.aptitude')
    await fenetre.getByRole('button', { name: 'Émettre et imprimer' }).click()
    await expect(
      fenetre.getByText('Remplacez les « …… » par le texte voulu avant d’émettre le certificat.'),
    ).toBeVisible()
    const valeur = await fenetre.getByRole('textbox', { name: /^Texte du certificat/ }).inputValue()
    await fenetre
      .getByRole('textbox', { name: /^Texte du certificat/ })
      .fill(valeur.replace('……', 'football en club'))
    await expect(
      fenetre.getByText('Texte retouché : les jours et les dates ne s’y mettent plus à jour.'),
    ).toBeVisible()
    await fenetre.getByRole('button', { name: 'Émettre et imprimer' }).click()
    impression = page.getByRole('dialog', { name: 'Imprimer le certificat' })
    await expect(impression.getByText(/n° CERT-\d{4}-0002/)).toBeVisible()
    await telechargerPdf(page, impression, 'certificat-aptitude')
    expect(
      lireBase(`select count(*) from public.certificates c join public.patients p on p.id = c.patient_id
                 where p.first_name = 'Aissatou' and c.body ~ 'Toux|Râles|Amoxicilline|\\{'`),
    ).toBe('0')
    expect(erreurs).toEqual([])
  })

  test('prochain rendez-vous, puis ordonnance qui l’imprime', async ({ page }) => {
    test.setTimeout(120 * 1000)
    const erreurs = surveillerConsole(page)
    await connecter(page, COMPTES.infirmier)
    for (const [prenom, type] of [
      ['Aissatou', 'Consultation'],
      ['Ndella', 'Planification familiale'],
    ]) {
      await ouvrirConsultation(page, prenom)
      await page.getByRole('button', { name: 'Prochain rendez-vous' }).click()
      const fenetre = page.getByRole('dialog', { name: 'Prochain rendez-vous' })
      await choisir(fenetre.getByRole('combobox', { name: /^Type de rendez-vous/ }), type)
      const propositions = fenetre.getByRole('region', { name: 'Prochaines séances' })
      await expect(
        propositions
          .getByRole('button')
          .or(propositions.getByText(/Aucune séance/))
          .first(),
      ).toBeVisible()
      if (await propositions.getByRole('button').count()) {
        await propositions.getByRole('button').first().click()
      } else {
        const jour = lireBase(`select to_char(public.org_local_date(o.id) + 7, 'DD/MM/YYYY')
                                 from public.organizations o where o.name = 'Poste de santé Test'`)
        await fenetre.getByRole('textbox', { name: /^Date/ }).fill(jour)
        await fenetre.getByLabel(/^Heure/).fill('10:00')
      }
      if (prenom === 'Aissatou') await verifierEcran(page, 'prochain-rdv-fenetre')
      await fenetre.getByRole('button', { name: 'Enregistrer le rendez-vous' }).click()
      const confirmer = fenetre.getByRole('button', { name: 'Confirmer le rendez-vous' })
      await expect(
        page
          .getByText(/Rendez-vous enregistré :/)
          .or(confirmer)
          .first(),
      ).toBeVisible()
      if (await confirmer.isVisible()) await confirmer.click()
      await expect(fenetre).toHaveCount(0)
      await expect(
        page.locator('.documents-consultation__ligne', {
          hasText: /Rendez-vous \S+ \d\d\/\d\d\/\d{4} à \d\d:\d\d/,
        }),
      ).toHaveCount(1)
    }
    expect(
      lireBase(`select string_agg(a.source || ':' || a.source_ref, ',') from public.appointments a
                  join public.encounter_followups f on f.appointment_id = a.id`),
    ).toBe('followup:consultation,followup:consultation')

    // L'ordonnance imprime le prochain rendez-vous (date et heure seulement : voir l'image).
    await ouvrirConsultation(page, 'Aissatou')
    await page.getByRole('button', { name: 'Imprimer l’ordonnance' }).click()
    await telechargerPdf(
      page,
      page.getByRole('dialog', { name: 'Imprimer l’ordonnance' }),
      'ordonnance-prochain-rdv',
    )

    // Accueil : le rendez-vous de PF est « Consultation », sans origine.
    const [org, du] = lireBase(
      `select o.id || '|' || public.org_local_date(o.id) from public.organizations o
        where o.name = 'Poste de santé Test'`,
    ).split('|')
    const vu = ecrireBase(
      COMPTES.accueil,
      `select a.type_label || '|' || a.is_discreet || '|' || a.source
         from public.list_appointments('${org}', '${du}'::date, '${du}'::date + 60) a
        where a.patient_first_name = 'Ndella' and a.patient_last_name = 'DOC'`,
    )
    expect(vu).toBe('Consultation|false|agenda')
    expect(erreurs).toEqual([])
  })

  test('page Références : retard, pli confidentiel, contre-référence', async ({ page }) => {
    const erreurs = surveillerConsole(page)
    await connecter(page, COMPTES.infirmier)
    await page.getByRole('link', { name: 'Références' }).first().click()
    await page.waitForURL(/\/app\/references$/)
    const ancienne = page.locator('tr, .table__carte', { hasText: 'DOC Ancienne' }).first()
    await expect(ancienne.getByText('En retard')).toBeVisible()
    await expect(ancienne.getByText('20 jours')).toBeVisible()
    const confidentielle = page.locator('tr', { hasText: 'DOC Confidentielle' }).first()
    await expect(confidentielle.getByText('Pli confidentiel')).toBeVisible()
    await expect(page.locator('body')).not.toContainText('Retrait d’implant')

    await ancienne.getByRole('button', { name: 'Saisir la contre-référence' }).click()
    const fenetre = page.getByRole('dialog', { name: 'Saisir la contre-référence' })
    await expect(fenetre.getByText(/Suspicion d.appendicite/)).toBeVisible()
    await fenetre.getByRole('button', { name: 'Enregistrer la contre-référence' }).click()
    await expect(fenetre.getByText(/Remplissez au moins le diagnostic retenu/)).toBeVisible()
    await fenetre.getByRole('textbox', { name: /^Diagnostic retenu/ }).fill('Appendicite aiguë')
    await fenetre.getByRole('textbox', { name: /^Traitement/ }).fill('Appendicectomie le jour même')
    await fenetre
      .getByRole('textbox', { name: /^Suivi/ })
      .fill('Contrôle de la cicatrice dans 10 jours')
    await verifierEcran(page, 'contre-reference')
    await fenetre.getByRole('button', { name: 'Enregistrer la contre-référence' }).click()
    await expect(page.getByText('Contre-référence enregistrée')).toBeVisible()
    await expect(page.locator('tr', { hasText: 'DOC Ancienne' })).toHaveCount(0)

    await page.getByRole('tab', { name: 'Retours reçus' }).click()
    await page
      .locator('tr', { hasText: 'DOC Ancienne' })
      .getByRole('button', { name: 'Voir la contre-référence' })
      .click()
    const fiche = page.getByRole('dialog', { name: 'Référence' })
    await expect(fiche.getByText('Appendicite aiguë')).toBeVisible()
    await expect(fiche.getByText(/^Saisie le .* par Awa Faye$/)).toBeVisible()
    expect(erreurs).toEqual([])
  })

  test('Paramètres → Références et Certificats (owner qui n’exerce pas)', async ({ page }) => {
    const erreurs = surveillerConsole(page)
    await connecter(page, COMPTES.ownerPoste)
    await page.goto('/app/parametres?onglet=references')
    const delai = page.getByRole('textbox', { name: /^Délai de retour attendu/ })
    // Aucun réglage : case vide, le délai par défaut vient de la base.
    await expect(delai).toHaveValue('')
    await delai.fill('0')
    await page.getByRole('button', { name: 'Enregistrer les modifications' }).click()
    await expect(
      page.getByText('Tapez un nombre de jours, de 1 à 365, ou laissez vide.'),
    ).toBeVisible()
    await delai.fill('21')
    await page.getByRole('button', { name: 'Enregistrer les modifications' }).click()
    await expect(page.getByText('Références : modifications enregistrées')).toBeVisible()
    expect(
      lireBase(`select settings ->> 'referral_return_days' from public.organizations
                 where name = 'Poste de santé Test'`),
    ).toBe('21')
    await page.getByRole('button', { name: 'Ajouter un établissement' }).click()
    await page.getByRole('textbox', { name: /^Nom/ }).fill('Centre de santé de Vélingara')
    await page.getByRole('button', { name: 'Ajouter l’établissement' }).click()
    await expect(page.getByText('Centre de santé de Vélingara')).toBeVisible()
    await verifierEcran(page, 'parametres-references')

    await page.goto('/app/parametres?onglet=certificats')
    const ligne = page.locator('.liste-reglages__ligne', { hasText: 'Certificat médical' })
    await ligne.getByRole('button', { name: 'Modifier' }).click()
    const texte = page.getByRole('textbox', { name: /^Texte/ })
    await texte.fill(`${await texte.inputValue()} Diagnostic : {diagnostic}.`)
    await page.getByRole('button', { name: 'Enregistrer', exact: true }).click()
    await expect(
      page.getByText('Variable inconnue : {diagnostic}. Utilisez seulement celles de la liste.'),
    ).toBeVisible()
    await verifierEcran(page, 'parametres-certificats')
    expect(erreurs).toEqual([])
  })

  test('coupure : la saisie de la lettre reste sur l’appareil', async ({ page, context }) => {
    const erreurs = surveillerConsole(page)
    await connecter(page, COMPTES.infirmier)
    await ouvrirConsultation(page, 'Aissatou')
    await page.getByRole('button', { name: 'Référer le patient' }).click()
    let fenetre = page.getByRole('dialog', { name: 'Référer le patient' })
    await fenetre
      .getByRole('textbox', { name: /^Motif de la référence/ })
      .fill('Avis de pneumologie')
    await context.setOffline(true)
    await expect(
      fenetre.getByRole('button', { name: 'Émettre et imprimer la lettre' }),
    ).toBeDisabled()
    await expect(fenetre.getByText('Vous êtes hors ligne')).toBeVisible()
    await page.waitForTimeout(1500)
    await context.setOffline(false)
    await page.reload()
    await page.getByRole('button', { name: 'Référer le patient' }).click()
    fenetre = page.getByRole('dialog', { name: 'Référer le patient' })
    await expect(fenetre.getByText(/Votre saisie de \d\d:\d\d a été retrouvée/)).toBeVisible()
    await expect(fenetre.getByRole('textbox', { name: /^Motif de la référence/ })).toHaveValue(
      'Avis de pneumologie',
    )
    expect(
      erreurs.filter((e) => !/Failed to fetch|ERR_INTERNET_DISCONNECTED|net::/.test(e)),
    ).toEqual([])
  })

  test('aide-soignant : aucun document, pas de page Références', async ({ page }) => {
    const erreurs = surveillerConsole(page)
    await connecter(page, COMPTES.aideSoignant)
    await expect(page.getByRole('link', { name: 'Références' })).toHaveCount(0)
    await page.goto(`/app/consultations/${consultationDe('Aissatou')}`)
    await expect(page.getByText('Toux et fièvre depuis 4 jours')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Référer le patient' })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Documents' })).toHaveCount(0)
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
      await expect(page.getByRole('link', { name: 'Références' })).toHaveCount(0)
      await page.goto('/app/references')
      await page.waitForLoadState('networkidle')
      await expect(
        page.getByText(/réservées aux soignants|ne fait pas partie|pas accès|rôle/i).first(),
      ).toBeVisible()
      for (const prenom of ['Aissatou', 'Ancienne']) {
        await page.goto(`/app/consultations/${consultationDe(prenom)}`)
        await page.waitForLoadState('networkidle')
        const patient = lireBase(
          `select id from public.patients where last_name = 'DOC' and first_name = '${prenom}'`,
        )
        await page.goto(`/app/patients/${patient}`)
        await page.waitForLoadState('networkidle')
        const chronologie = page.getByRole('tab', { name: 'Chronologie' })
        if (await chronologie.isVisible()) {
          await chronologie.click()
          await page.waitForLoadState('networkidle')
        }
        expect(await page.locator('body').innerText()).not.toMatch(CONTENU)
      }
      expect(reponses.filter((r) => CONTENU.test(r.texte)).map((r) => r.url)).toEqual([])
    })
  }
})
