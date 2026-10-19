// Base locale des tests de bout en bout : recréée de zéro à chaque lancement.
//   stubs Supabase -> toutes les migrations -> comptes de test -> données de l'agenda.
// Connexion : variables PGHOST / PGPORT (base « fajkat_e2e », utilisateur postgres).
// Jamais fajkat-dev : le nom de la base est fixé ici et la connexion est locale.
import { execFileSync } from 'node:child_process'
import { readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { COMPTES } from './comptes.js'

const RACINE = new URL('..', import.meta.url).pathname
const BASE = 'fajkat_e2e'
const commun = ['-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-q']

if (
  process.env.PGHOST &&
  !process.env.PGHOST.startsWith('/') &&
  process.env.PGHOST !== 'localhost'
) {
  throw new Error('Tests de bout en bout : base locale seulement (PGHOST = socket ou localhost).')
}

function psql(base, fichier) {
  execFileSync('psql', [...commun, '-d', base, '-f', fichier], {
    stdio: ['ignore', 'ignore', 'inherit'],
  })
}

const echappe = (t) => t.replaceAll("'", "''")

execFileSync('dropdb', ['-U', 'postgres', '--if-exists', BASE])
execFileSync('createdb', ['-U', 'postgres', BASE])
psql(BASE, join(RACINE, 'e2e/stubs.sql'))
for (const f of readdirSync(join(RACINE, 'supabase/migrations')).sort()) {
  psql(BASE, join(RACINE, 'supabase/migrations', f))
}

// Comptes de test, puis structures créées par leur owner (comme dans l'application).
const comptes = Object.values(COMPTES)
  .map(
    (c) =>
      `('${c.id}', 'authenticated', 'authenticated', '${c.email}', ` +
      `jsonb_build_object('full_name', '${echappe(c.nom)}'), now(), now(), now())`,
  )
  .join(',\n')
const membres = Object.values(COMPTES)
  .filter((c) => c.role)
  .map((c) => {
    const org = c.role === 'medecin' ? 'Clinique NDIAYE' : 'Poste de santé Test'
    return `select id, '${c.id}'::uuid, '${c.role}' from public.organizations where name = '${org}'`
  })
  .join('\nunion all ')
const sql = `
insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at, email_confirmed_at)
values ${comptes};

set role authenticated;
select set_config('request.jwt.claims', '{"sub": "${COMPTES.ownerPoste.id}", "role": "authenticated"}', false);
select public.create_organization('Poste de santé Test', 'poste_sante', 'SN', 'Kolda');
select set_config('request.jwt.claims', '{"sub": "${COMPTES.ownerClinique.id}", "role": "authenticated"}', false);
select public.create_organization('Clinique NDIAYE', 'clinique', 'SN', 'Dakar');
reset role;
select set_config('request.jwt.claims', '', false);

insert into public.memberships (org_id, user_id, role)
${membres};
-- Assistant de démarrage déjà vu : les tests vont droit aux modules.
update public.organizations
   set settings = settings || '{"onboarding": {"vu_le": "2026-01-01T00:00:00Z"}}'::jsonb;
`
const fichier = join(tmpdir(), 'fajkat-e2e-comptes.sql')
writeFileSync(fichier, sql)
psql(BASE, fichier)
psql(BASE, join(RACINE, 'supabase/tests/donnees_agenda.sql'))
psql(BASE, join(RACINE, 'e2e/donnees.sql'))
console.log(`Base ${BASE} prête : ${comptes.split('\n').length} comptes de test.`)
