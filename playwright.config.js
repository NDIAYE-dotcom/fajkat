// Tests de bout en bout (Playwright) : application servie par Vite, API locale
// (e2e/serveur-local.js : un PostgREST par worker sur sa base fajkat_e2e_n, connexion
// simulée). Lancement : npm run test:e2e (prépare les bases, puis lance les parcours) ;
// E2E_WORKERS=1 npm run test:e2e -- e2e/agenda.spec.js pour déboguer un seul fichier.
// Chaque fichier reste entier dans un worker, ses tests dans l'ordre.
// Jamais fajkat-dev ni les vrais comptes.
import { defineConfig, devices } from '@playwright/test'
import { origineWorker, PORTS, WORKERS } from './e2e/comptes.js'
import { CLE_ANON } from './e2e/jetons.js'

// Build des tests, hors du dépôt (node_modules est ignoré par Git).
const SORTIE = 'node_modules/.cache/fajkat-e2e'

export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',
  fullyParallel: false,
  workers: WORKERS,
  retries: 0,
  timeout: 60 * 1000,
  // 10 s au lieu de 5 : avec 4 workers sur la même machine, une requête lente de la base
  // (list_appointments) dépasse parfois 5 s.
  expect: { timeout: 10 * 1000 },
  reporter: [['list']],
  use: {
    // Ce fichier est relu par chaque worker, après que Playwright a posé TEST_PARALLEL_INDEX :
    // le worker n ouvre l'application à http://wn.localhost:5179 (sa base, d'après l'origine).
    baseURL: origineWorker(process.env.TEST_PARALLEL_INDEX ?? 0),
    locale: 'fr-FR',
    timezoneId: 'Africa/Dakar',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'node e2e/serveur-local.js',
      url: `http://localhost:${PORTS.api}/`,
      reuseExistingServer: false,
      stdout: 'ignore',
    },
    // Application construite une fois (2 s), puis servie telle quelle : plus de transformation
    // de chaque module à chaque page, qui saturait la machine avec plusieurs workers. React
    // reste en mode développement (NODE_ENV) : ses avertissements arrivent dans la console.
    {
      command:
        `npx vite build --mode development --outDir ${SORTIE} --emptyOutDir --logLevel error && ` +
        `npx vite preview --outDir ${SORTIE} --port ${PORTS.app} --strictPort`,
      url: `http://localhost:${PORTS.app}/`,
      reuseExistingServer: false,
      timeout: 120 * 1000,
      env: {
        NODE_ENV: 'development',
        VITE_SUPABASE_URL: `http://localhost:${PORTS.api}`,
        VITE_SUPABASE_ANON_KEY: CLE_ANON,
        VITE_AUTH_SMS: 'false',
      },
    },
  ],
})
