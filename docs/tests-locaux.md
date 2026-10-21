# Tests locaux

Tout tourne sur le Mac, jamais sur fajkat-dev ni avec les vrais comptes.

| Commande                                               | Ce qu'elle fait                                               |
| ------------------------------------------------------ | ------------------------------------------------------------- |
| `npm run test:sql`                                     | tests SQL de `supabase/tests` sur une base neuve `fajkat_sql` |
| `npm run test:e2e`                                     | parcours Playwright, 4 workers en parallèle                   |
| `E2E_WORKERS=1 npm run test:e2e -- e2e/agenda.spec.js` | un seul fichier, un seul worker (débogage)                    |

Suite complète : lancer sous `caffeinate -i` pour que le Mac ne se mette pas en veille.

## Ce qu'il faut sur le Mac

### Postgres 16 (Homebrew)

Démarré avec le Mac par `brew services` (LaunchAgent `sh.brew.postgresql@16`).

```sh
brew services list                        # postgresql@16 doit être « started »
brew services start postgresql@16         # sinon, une fois : démarre et redémarre avec le Mac
```

### PostgREST, rangé hors du dépôt

Le serveur local des tests (`e2e/serveur-local.js`) cherche le binaire dans
`~/fajkat-outils/postgrest/postgrest`. Ce dossier n'est pas dans Git et survit aux redémarrages.
Un autre chemin reste possible : `E2E_POSTGREST=/chemin/postgrest npm run test:e2e`.

Si le binaire manque (message « PostgREST introuvable »), copier :

```sh
V=v14.18; mkdir -p ~/fajkat-outils/postgrest && cd ~/fajkat-outils/postgrest \
  && curl -sSLf -o pg.tar.xz "https://github.com/PostgREST/postgrest/releases/download/$V/postgrest-$V-macos-x86-64.tar.xz" \
  && tar xf pg.tar.xz && rm pg.tar.xz && ./postgrest --version
```

(Mac Apple Silicon : remplacer `macos-x86-64` par `macos-aarch64`.)

## Même version de PostgREST que fajkat-dev

Les tests doivent tourner avec la version de PostgREST de fajkat-dev (aujourd'hui **v14.18**,
vérifiée le 21/10/2026).

Où la lire :

- tableau de bord Supabase : projet fajkat-dev → Project Settings → Infrastructure → « PostgREST » ;
- ou, depuis le dépôt : `supabase link --project-ref <ref>` (ref dans `supabase/.temp/project-ref`)
  rafraîchit `supabase/.temp/rest-version`, puis `cat supabase/.temp/rest-version`.

Comparer avec la version locale : `~/fajkat-outils/postgrest/postgrest --version`.

Quand Supabase change de version : relancer la commande d'installation ci-dessus avec la
nouvelle valeur de `V` (elle remplace le binaire), corriger la version notée dans ce fichier,
puis lancer la suite complète.

## Parallélisme des parcours

- `e2e/preparer.js` construit une base modèle `fajkat_e2e_modele` (stubs, migrations, comptes,
  données), puis la clone pour chaque worker : `fajkat_e2e_0`, `fajkat_e2e_1`…
- `e2e/serveur-local.js` lance un PostgREST par worker (ports 54330 + n) derrière une seule
  adresse d'API (54321). Le worker n ouvre l'application à `http://wn.localhost:5179` : le
  serveur reconnaît le worker à l'origine des requêtes (Chrome envoie `*.localhost` vers la
  machine, Vite les accepte).
- L'application est construite une fois (`vite build --mode development`, 2 s, dans
  `node_modules/.cache/fajkat-e2e`) puis servie par `vite preview` : React reste en mode
  développement, ses avertissements arrivent dans la console relevée par les parcours.
- Délai des `expect` : 10 s (une requête de la base dépasse parfois 5 s sous la charge).
- Mesuré le 21/10/2026 (130 parcours, Mac Intel 4 cœurs) : 23,0 min avec 1 worker et le
  serveur de développement, 8,3 min avec 4 workers.
- Un fichier `.spec.js` reste entier dans un worker, ses tests dans l'ordre. Les fichiers ne
  dépendent jamais les uns des autres : chacun doit pouvoir tourner seul sur une base neuve.
