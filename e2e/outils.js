// Outils communs des parcours : connexion, contrôles d'écran, captures, console.
import { expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { MOT_DE_PASSE } from './comptes.js'

export const LARGEURS = [360, 768, 1440]
const CAPTURES = new URL('./captures/', import.meta.url).pathname
mkdirSync(CAPTURES, { recursive: true })

// Dates locales de la structure (Africa/Dakar), comme dans l'application.
export function aujourdhui() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Dakar' }).format(new Date())
}
export function ajouterJours(iso, n) {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
// Prochain mardi (aujourd'hui si l'on est mardi), comme supabase/tests/donnees_agenda.sql.
export function prochainMardi() {
  const auj = aujourdhui()
  const iso = ((new Date(`${auj}T12:00:00Z`).getUTCDay() + 6) % 7) + 1
  return ajouterJours(auj, (2 - iso + 7) % 7)
}

// Erreurs de la console et de la page, relevées pendant tout le test.
export function surveillerConsole(page) {
  const erreurs = []
  page.on('console', (m) => {
    if (m.type() === 'error') erreurs.push(m.text())
  })
  page.on('pageerror', (e) => erreurs.push(e.message))
  return erreurs
}

export async function connecter(page, compte) {
  await page.goto('/connexion')
  await page.locator('#cx-email').fill(compte.email)
  await page.locator('#cx-mot-de-passe').fill(MOT_DE_PASSE)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await page.waitForURL(/\/app/)
}

// Contrôles de mise en page de l'écran affiché, puis capture.
//   - aucun défilement horizontal ;
//   - aucun texte hors de son cadre (ligne, cellule, section, jauge, fenêtre) ni de l'écran ;
//   - aucun mot ni numéro coupé sur deux lignes ;
//   - jamais « undefined », « null » ni « NaN ».
export async function verifierEcran(page, nom) {
  await page.waitForLoadState('networkidle')
  const constats = await page.evaluate(() => {
    const resultat = { defilement: 0, debordements: [], coupures: [], mots: [] }
    const doc = document.documentElement
    resultat.defilement = doc.scrollWidth - doc.clientWidth
    // Masqué à l'écran mais lu par les lecteurs d'écran (clip, boîte de 1 px) : ignoré.
    const masqueVisuellement = (el) => {
      for (let a = el; a && a !== document.body; a = a.parentElement) {
        const s = getComputedStyle(a)
        const r = a.getBoundingClientRect()
        if (
          (s.clip && s.clip !== 'auto') ||
          (s.overflow === 'hidden' && (r.width <= 1 || r.height <= 1))
        ) {
          return true
        }
      }
      return false
    }
    const visible = (el) => {
      const s = getComputedStyle(el)
      const r = el.getBoundingClientRect()
      return (
        s.visibility !== 'hidden' &&
        s.display !== 'none' &&
        r.width > 0 &&
        r.height > 0 &&
        !masqueVisuellement(el)
      )
    }
    const cadres = 'li, td, th, section, header, .jauge-seance, dialog, .modal__boite'
    for (const el of document.body.querySelectorAll('*')) {
      const texte = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())
      if (!texte || !visible(el) || el.closest('[aria-hidden="true"], .sr-only, .visually-hidden'))
        continue
      const r = el.getBoundingClientRect()
      const cadre = el.parentElement?.closest(cadres)
      const c = cadre?.getBoundingClientRect()
      if (
        r.right > window.innerWidth + 1 ||
        (c && (r.right > c.right + 1 || r.left < c.left - 1))
      ) {
        resultat.debordements.push(el.textContent.trim().slice(0, 60))
      }
    }
    const marche = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    while (marche.nextNode()) {
      const noeud = marche.currentNode
      const parent = noeud.parentElement
      if (!parent || !visible(parent) || parent.closest('script, style, [aria-hidden="true"]'))
        continue
      for (const m of noeud.textContent.matchAll(/\S+/g)) {
        const plage = document.createRange()
        plage.setStart(noeud, m.index)
        plage.setEnd(noeud, m.index + m[0].length)
        const hauts = new Set(
          [...plage.getClientRects()].filter((x) => x.width > 0).map((x) => Math.round(x.top)),
        )
        if (hauts.size > 1) resultat.coupures.push(m[0])
      }
    }
    const tout = document.body.innerText
    resultat.mots = [...new Set(tout.match(/\b(undefined|null|NaN)\b/g) ?? [])]
    return resultat
  })
  const largeur = page.viewportSize().width
  await page.screenshot({ path: `${CAPTURES}${nom}-${largeur}.png`, fullPage: true })
  expect(constats.defilement, `${nom} ${largeur} px : défilement horizontal`).toBeLessThanOrEqual(0)
  expect(constats.debordements, `${nom} ${largeur} px : texte hors de son cadre`).toEqual([])
  expect(constats.coupures, `${nom} ${largeur} px : mot ou numéro coupé`).toEqual([])
  expect(constats.mots, `${nom} ${largeur} px : valeur technique à l'écran`).toEqual([])
}

// Réponses de l'API relevées pendant le test (contrôle de confidentialité côté réseau).
export function relever(page, motif) {
  const corps = []
  page.on('response', async (r) => {
    if (!motif.test(r.url())) return
    try {
      corps.push({ url: r.url(), texte: await r.text() })
    } catch {
      // Réponse sans corps (HEAD, 204).
    }
  })
  return corps
}
