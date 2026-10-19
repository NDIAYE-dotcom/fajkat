import js from '@eslint/js'
import { defineConfig, globalIgnores } from 'eslint/config'
import prettier from 'eslint-config-prettier'
import reactHooks from 'eslint-plugin-react-hooks'
import { reactRefresh } from 'eslint-plugin-react-refresh'
import globals from 'globals'

// Configuration ESLint en JavaScript pur : aucune règle TypeScript.
export default defineConfig([
  globalIgnores(['dist', 'supabase/functions', 'test-results', 'playwright-report']),
  // Tests de bout en bout et leur configuration : exécutés par Node (Playwright).
  {
    files: ['e2e/**/*.js', 'playwright.config.js'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite(),
      prettier,
    ],
    languageOptions: {
      ecmaVersion: 'latest',
      globals: globals.browser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
    },
  },
  // Application connectée : les icônes passent par <Icone> (taille 20, trait 1,5, accessibilité).
  // La page publique (src/pages/public) garde ses propres réglages.
  {
    files: ['src/components/ui/**/*.jsx', 'src/modules/**/*.jsx', 'src/pages/Atelier/**/*.jsx'],
    ignores: ['src/components/ui/Icone/Icone.jsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'JSXAttribute[name.name=/^(size|strokeWidth|absoluteStrokeWidth)$/]',
          message:
            'Icônes : utilisez <Icone icone={…} taille={…} epaisseur={…} /> (src/components/ui/Icone).',
        },
      ],
    },
  },
  {
    files: ['*.config.js'],
    languageOptions: { globals: globals.node },
  },
])
