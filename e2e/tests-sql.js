// Tous les tests SQL de supabase/tests sur une base locale neuve (« fajkat_sql ») :
// stubs Supabase, toutes les migrations, puis chaque test (chacun finit par ROLLBACK).
// Connexion : PGHOST / PGPORT, utilisateur postgres. Jamais fajkat-dev.
import { execFileSync, spawnSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'

const RACINE = new URL('..', import.meta.url).pathname
const BASE = 'fajkat_sql'
const psql = (fichier) =>
  spawnSync('psql', ['-U', 'postgres', '-d', BASE, '-q', '-v', 'ON_ERROR_STOP=1', '-f', fichier], {
    encoding: 'utf8',
  })

execFileSync('dropdb', ['-U', 'postgres', '--if-exists', BASE])
execFileSync('createdb', ['-U', 'postgres', BASE])
for (const f of [
  join(RACINE, 'e2e/stubs.sql'),
  ...readdirSync(join(RACINE, 'supabase/migrations'))
    .sort()
    .map((m) => join(RACINE, 'supabase/migrations', m)),
]) {
  const r = psql(f)
  if (r.status !== 0) throw new Error(`Migration en échec : ${f}\n${r.stderr}`)
}

let echecs = 0
for (const t of readdirSync(join(RACINE, 'supabase/tests'))
  .filter((f) => /^etape.*\.sql$/.test(f))
  .sort()) {
  const r = psql(join(RACINE, 'supabase/tests', t))
  const ok = (r.stderr.match(/OK :/g) ?? []).length
  const erreur = r.stderr.split('\n').find((l) => /ERROR|ERREUR/.test(l))
  if (r.status !== 0) echecs += 1
  console.log(
    `${r.status === 0 ? 'réussi' : 'ÉCHEC '}  ${t.padEnd(16)} ${ok} OK${erreur ? `  — ${erreur.replace(/^psql:[^ ]* /, '')}` : ''}`,
  )
}
process.exit(echecs ? 1 : 0)
