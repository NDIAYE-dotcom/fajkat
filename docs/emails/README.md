# E-mails d'authentification (Supabase)

Modèles HTML en français, à la charte Fajkat. Ils sont à coller à la main dans le tableau de bord
Supabase du projet : **Authentication → Emails → Templates**.

| Modèle Supabase | Objet à saisir                        | Fichier à coller        |
| --------------- | ------------------------------------- | ----------------------- |
| Confirm signup  | Confirmez votre adresse e-mail Fajkat | `confirmation.html`     |
| Reset password  | Votre nouveau mot de passe Fajkat     | `reinitialisation.html` |

Variables utilisées (remplacées par Supabase) : `{{ .RedirectTo }}`, `{{ .TokenHash }}` et
`{{ .Email }}`.

## État actuel : modèles inactifs

Les modèles sont déclarés dans `supabase/config.toml` (`[auth.email.template.*]`) et ont été
poussés avec `npx supabase config push`. **Supabase les ignore tant qu'aucun SMTP personnalisé
n'est configuré** : il envoie ses modèles par défaut (en anglais), dont le lien est
`{{ .ConfirmationURL }}`.

## Fonctionnement des liens

Toutes les demandes envoient `redirectTo` = `<site>/auth/confirmer` (inscription) ou
`<site>/auth/confirmer?type=recovery` (mot de passe), voir `src/lib/auth.js`.

**Aujourd'hui, avec les modèles par défaut :**

- Supabase vérifie le lien, puis renvoie sur `/auth/confirmer?code=…`, qui appelle
  `exchangeCodeForSession`.
- Le flux PKCE impose le navigateur qui a fait la demande :
  - une inscription confirmée sur un autre appareil est bien confirmée, et la page invite à se
    connecter ;
  - un lien de mot de passe ouvert sur un autre appareil ne fonctionne pas, et la page l'explique.

**Plus tard, avec un SMTP et nos modèles :**

- confirmation : `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email`
- mot de passe : `{{ .RedirectTo }}&token_hash={{ .TokenHash }}` (ici, `{{ .RedirectTo }}`
  contient déjà `?type=recovery`).

`/auth/confirmer` appelle alors `verifyOtp({ token_hash, type })`. Cela fonctionne depuis
n'importe quel appareil, et un antivirus de messagerie qui visite le lien ne le consomme pas.

Si l'adresse de retour ne figure pas dans les Redirect URLs, Supabase la remplace par la
Site URL : gardez les deux motifs ci-dessous.

## Réglages qui vont avec

- **Authentication → URL Configuration**
  - Site URL : `https://fajkat.vercel.app`
  - Redirect URLs : `http://localhost:5173/**` et `https://fajkat.vercel.app/**`
- **Authentication → Providers → Email** : « Confirm email » activé ; mot de passe d'au moins
  8 caractères, avec des lettres et des chiffres (mêmes règles que `src/lib/motDePasse.js`).

## Notes

- Mise en page en tableaux et styles en ligne : c'est ce que les messageries (Gmail, Outlook,
  applications Android) affichent le plus fidèlement. Les polices de l'application n'y sont pas
  disponibles : Georgia remplace Spectral, Verdana remplace Atkinson Hyperlegible.
- Le serveur d'envoi intégré de Supabase est limité à quelques e-mails par heure : prévoir un SMTP
  (Authentication → Emails → SMTP Settings) avant l'ouverture au public.
