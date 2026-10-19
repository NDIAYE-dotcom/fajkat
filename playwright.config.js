// Tests de bout en bout (Playwright) : application servie par Vite, API locale
// (e2e/serveur-local.js : PostgREST sur la base fajkat_e2e, connexion simulée).
// Lancement : npm run test:e2e (prépare la base, puis lance les parcours).
// Jamais fajkat-dev ni les vrais comptes.
import { defineConfig, devices } from '@playwright/test'
import { PORTS } from './e2e/comptes.js'
import { CLE_ANON } from './e2e/jetons.js'

export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60 * 1000,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORTS.app}`,
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
    {
      command: `npx vite --port ${PORTS.app} --strictPort`,
      url: `http://localhost:${PORTS.app}/`,
      reuseExistingServer: false,
      env: {
        VITE_SUPABASE_URL: `http://localhost:${PORTS.api}`,
        VITE_SUPABASE_ANON_KEY: CLE_ANON,
        VITE_AUTH_SMS: 'false',
      },
    },
  ],
})
