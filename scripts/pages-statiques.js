// Après « vite build » : écrit une page HTML statique par adresse publique, avec ses propres
// titre, description et balises Open Graph. WhatsApp et Facebook lisent le HTML brut pour
// construire l'aperçu d'un lien (ils n'exécutent pas le JavaScript).
// Génère aussi sitemap.xml et robots.txt. Aucune dépendance : Node seul.
// Données : src/lib/partage.js (domaine, titres, descriptions, images).

import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { DIMENSIONS_IMAGE_PARTAGE, PAGES_PARTAGE, PAGES_SITEMAP, SITE } from '../src/lib/partage.js'

const DIST = fileURLToPath(new URL('../dist/', import.meta.url))
const MARQUEUR = /<title>[\s\S]*?<\/title>\s*<!-- partage[\s\S]*?-->/

// Échappement des valeurs placées dans des attributs ou du texte HTML.
function echapper(texte) {
  return texte
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

function balises(chemin, page) {
  const url = new URL(chemin, SITE.url).href
  const image = new URL(page.image, SITE.url).href
  const t = echapper(page.titre)
  const d = echapper(page.description)
  return [
    `<title>${t}</title>`,
    `<meta name="description" content="${d}" />`,
    `<link rel="canonical" href="${url}" />`,
    `<meta name="theme-color" content="${SITE.couleurTheme}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${SITE.nom}" />`,
    `<meta property="og:locale" content="fr_FR" />`,
    `<meta property="og:title" content="${t}" />`,
    `<meta property="og:description" content="${d}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:image" content="${image}" />`,
    `<meta property="og:image:width" content="${DIMENSIONS_IMAGE_PARTAGE.largeur}" />`,
    `<meta property="og:image:height" content="${DIMENSIONS_IMAGE_PARTAGE.hauteur}" />`,
    `<meta property="og:image:alt" content="${echapper(page.imageAlt)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${t}" />`,
    `<meta name="twitter:description" content="${d}" />`,
    `<meta name="twitter:image" content="${image}" />`,
    ...(page.prechargements ?? []).map(
      ({ href, media }) =>
        `<link rel="preload" as="image" href="${href}" fetchpriority="high"${media ? ` media="${media}"` : ''} />`,
    ),
  ].join('\n    ')
}

const gabarit = await readFile(`${DIST}index.html`, 'utf8')
if (!MARQUEUR.test(gabarit)) {
  throw new Error('Marqueur « partage » introuvable dans dist/index.html (voir index.html).')
}

for (const [chemin, page] of Object.entries(PAGES_PARTAGE)) {
  await writeFile(`${DIST}${page.fichier}`, gabarit.replace(MARQUEUR, balises(chemin, page)))
  console.log(`  ${page.fichier.padEnd(22)} ${chemin}`)
}

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${PAGES_SITEMAP.map((chemin) => `  <url><loc>${new URL(chemin, SITE.url).href}</loc></url>`).join('\n')}
</urlset>
`
await writeFile(`${DIST}sitemap.xml`, sitemap)

const robots = `User-agent: *
Allow: /
Disallow: /app

Sitemap: ${new URL('/sitemap.xml', SITE.url).href}
`
await writeFile(`${DIST}robots.txt`, robots)
console.log('  sitemap.xml, robots.txt')
