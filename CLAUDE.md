# CLAUDE.md — Projet Fajkat

## 1. Le produit
Fajkat est un SaaS de gestion pour les structures de santé au Sénégal et dans l'espace UEMOA.
Deux offres, choisies à l'inscription, qui déterminent les modules visibles :
- POSTE DE SANTÉ — 5 500 FCFA / mois : postes de santé publics, privés, confessionnels ou communautaires, dirigés par un infirmier chef de poste (ICP) ou une sage-femme, avec un comité de développement sanitaire (CDS).
- CLINIQUE — 10 500 FCFA / mois : cliniques et cabinets privés, plusieurs praticiens, hospitalisation, laboratoire, imagerie, bloc.
Une structure = une organisation (tenant). Un utilisateur peut appartenir à plusieurs structures.
Exigence de qualité : un produit très professionnel, qu'un ICP à Kolda comme une directrice de clinique à Dakar adoptent sans formation lourde.

## 2. Stack imposée (ne jamais dévier sans me demander)
- React 18+ avec Vite, en JavaScript uniquement (.jsx / .js). AUCUN TypeScript : aucun fichier .ts / .tsx, aucune annotation de type.
- CSS pur : chaque composant est un dossier avec deux fichiers, par exemple Home/Home.jsx + Home/Home.css (import './Home.css' en tête du .jsx).
- INTERDIT : Tailwind, Bootstrap, MUI, Chakra, Ant Design, shadcn, styled-components, CSS-in-JS, CSS Modules.
- Supabase : Postgres + Auth + Storage + Edge Functions + RLS, avec le client officiel @supabase/supabase-js.
- Edge Functions en JavaScript. Si l'outillage impose un fichier index.ts, y écrire du JavaScript pur, sans aucune syntaxe TypeScript.
- Hébergement du front : Vercel.
- Bibliothèques autorisées : react-router-dom, @supabase/supabase-js, @tanstack/react-query, react-hook-form, zod, dayjs (locale fr), lucide-react, @fontsource/spectral, @fontsource/atkinson-hyperlegible, @fontsource/ibm-plex-mono, @react-pdf/renderer, qrcode, dexie, exceljs.
- Toute autre dépendance : me demander avant de l'installer, en expliquant pourquoi.

## 3. Arborescence
```text
fajkat/
  CLAUDE.md  index.html  package.json  vite.config.js  .env.example
  public/                 favicon, manifest, images/
  docs/                   guides, conformité, rapports
  supabase/
    migrations/           un fichier SQL par étape (..._etape03_socle.sql)
    functions/            Edge Functions en JavaScript, un dossier par fonction
    tests/                tests SQL des policies RLS
    seed.sql
  src/
    main.jsx  App.jsx
    styles/               tokens.css, base.css, print.css
    lib/                  supabase.js, format.js, permissions.js, features.js, payments/
    hooks/                useAuth.js, useOrganization.js, useFeature.js, useOffre.js
    context/              AuthContext.jsx, OrgContext.jsx, OffreContext.jsx
    router/               routes.jsx, navigation.js, guards/
    components/
      ui/                 Button/Button.jsx + Button.css, Field/, Table/, Stamp/ ...
      layout/             AppLayout/, PublicLayout/
      charts/             graphiques SVG faits maison
    pages/
      public/             Landing/, Connexion/, Inscription/, Verifier/, Legal/
      Atelier/            vitrine du design system
    modules/              un dossier par module métier : pages/, components/, api.js, utils.js
      patients/  rendez-vous/  consultations/  maternite/  enfant/  pharmacie/
      stock/  caisse/  comptabilite/  documents/  whatsapp/  personnel/  rapports/
      hospitalisation/  laboratoire/  urgences/  communautaire/  admin/
```

## 4. Règles de code
- Composants fonctionnels et hooks. Un fichier .jsx dépasse rarement 250 lignes : au-delà, découper.
- Classes CSS en BEM préfixées par le composant : .patient-card, .patient-card__nom, .patient-card--urgent. Aucun sélecteur global hors de src/styles/.
- Couleurs, espacements, rayons, ombres et typographies UNIQUEMENT via les variables de src/styles/tokens.css. Aucune couleur en dur dans un composant.
- Accès aux données uniquement via le fichier api.js du module. Jamais d'appel Supabase dans un composant d'affichage.
- Code (variables, fonctions, tables, colonnes) en anglais snake_case pour la base, camelCase pour le JS. Tout texte visible par l'utilisateur en français.
- Chaque action réseau affiche un état de chargement, un message d'erreur clair en français, et ne fait jamais perdre la saisie.
- Formulaires longs : brouillon sauvegardé automatiquement (localStorage avec try/catch) — les coupures d'électricité sont fréquentes.
- Accessibilité : label sur chaque champ, navigation au clavier, contraste AA, cibles tactiles d'au moins 44 px.
- Mobile d'abord : chaque écran fonctionne à 360 px de large.
- Commentaires en français pour la logique métier non évidente.

## 5. Données et sécurité
- Toute table métier possède : id uuid, org_id uuid (référence organizations), created_at, updated_at, created_by, deleted_at (suppression douce).
- RLS activée sur TOUTES les tables, sans exception. Fonctions d'aide SQL : is_member(org_id), has_role(org_id, roles text[]), org_has_feature(org_id, feature text), current_org_status(org_id).
- Aucune suppression physique d'une donnée médicale. audit_logs alimenté par trigger sur les tables sensibles.
- Montants en FCFA stockés en entiers (bigint), jamais de décimales.
- Dates en timestamptz (UTC) en base ; affichage dans le fuseau de la structure (Africa/Dakar par défaut).
- Migrations : un fichier SQL par étape dans supabase/migrations. Ne jamais modifier une migration déjà appliquée : en créer une nouvelle.
- Buckets Storage privés (URLs signées) pour signatures, cachets, documents, dossiers patients, médias WhatsApp. Seul le bucket logos est public.
- Secrets (PayDunya, WhatsApp) uniquement dans les secrets des Edge Functions, jamais dans le front ni dans Git.
- Données sensibles (VIH / PTME, santé mentale…) : drapeau is_sensitive, visibles seulement par les rôles médicaux habilités, chaque lecture journalisée.

## 6. Offres et fonctionnalités (feature flags)
- organizations.type vaut 'poste_sante' ou 'clinique'. Le plan découle du type.
- Tables features et plan_features. Front : hook useFeature('hospitalisation'). Back : org_has_feature() dans les policies RLS.
- Un module non inclus n'apparaît nulle part : ni menu, ni recherche, ni raccourci.
- Le passage Poste -> Clinique se fait sans aucune perte de données.
- Codes communs aux deux offres : patients, file_attente, rendez_vous, consultations, references, maternite, vaccination, nutrition_enfant, pharmacie, stock, inventaire_auto, caisse, tiers_payants, comptabilite, personnel, documents, signature_cachet, whatsapp_liens, whatsapp_api, surveillance_epidemio, rapports, hors_ligne.
- Codes Poste de santé uniquement : tickets_consultation, communautaire, rapports_snis, gestion_cds.
- Codes Clinique uniquement : agenda_multi_praticiens, devis, factures_assurances, comptabilite_syscohada, whatsapp_numero_propre, hospitalisation, laboratoire, imagerie, urgences, bloc_operatoire, honoraires, multi_sites.

## 7. Design — « touche humaine », jamais un look généré par IA
Concept : « le registre vivant ». L'interface s'inspire des objets réels du soin au Sénégal : le grand registre ligné, le carnet de santé, la fiche cartonnée, le tampon encreur, l'annotation au stylo. Sobre, chaleureux, lisible sur un téléphone d'entrée de gamme en plein soleil.
Palette (tokens), tons menthe et sarcelle :
- --fond #F7FFFD : fond des pages
- --surface #D9F5EF : sections alternées, panneaux, aperçus
- --doux #A7E3D4 : filets, bordures, survols, badges
- --accent #5BB9A6 : illustrations, icônes, graphiques, décor. JAMAIS pour du texte sur fond clair ni pour un bouton à texte blanc (contraste 2,3:1, insuffisant).
- --primaire #2F5D57 : boutons, liens, titres, sections sombres (texte --fond dessus : 7,3:1).
Lisibilité : --encre #17302C (texte courant) · --encre-douce #4A6B66 (texte secondaire).
Couleurs fonctionnelles, uniquement pour les statuts : --tampon #B3362B (urgences, erreurs, tampons) · --attention #B7791F (avertissements, jamais en texte sur fond clair) · --succes = --primaire.
Les deux offres partagent la même palette ; html[data-offre] ne change pas la couleur primaire, seulement l'ambiance des sections (variables --section-fond, --section-texte, --section-texte-doux, --section-filet, --section-focus) :
- Poste de santé : ambiance claire (sections --fond et --surface, accents --accent).
- Clinique : davantage de sections sombres (fond --primaire, texte --fond).
Tout texte respecte le contraste AA (4,5:1, ou 3:1 pour le texte de grande taille).
Exception — page publique uniquement (l'application connectée reste sobre) :
- autorisés : dégradés très doux en fond de carte, coins arrondis (20 px pour les cartes, token --rayon-carte), ombres douces (--ombre-carte, --ombre-carte-survol), illustrations 3D de bâtiments fournies par le porteur du projet (public/images/) ;
- l'offre Clinique y a sa couleur propre, --clinique #1062E2 (texte blanc : 5,4:1) et --clinique-doux #E3EEFD ; l'offre Poste de santé garde la palette sarcelle ;
- l'écran de choix suit la maquette docs/references/maquette-choix.png, qui prime sur les autres règles de cette section.
Typographies, auto-hébergées via @fontsource :
- Titres : Spectral (600), éditoriale et humaine.
- Texte et interface : Atkinson Hyperlegible, conçue pour une lisibilité maximale.
- Chiffres, numéros de dossier, montants, doses : IBM Plex Mono avec chiffres tabulaires.
Signatures visuelles, à utiliser avec mesure :
- Tableaux façon registre : filets horizontaux fins, marge colorée (--accent) à gauche des panneaux importants.
- Badges « tampon » : bordure 2 px, majuscules, légère rotation de -2°, pour PAYÉ, URGENT, VACCINÉ, RÉFÉRÉ.
- Menu latéral en onglets d'intercalaire.
- Illustrations au trait (1,75 px, couleur encre), dessinées ou commandées, jamais générées par IA.
- Icônes : lucide-react via <Icone> (src/components/ui/Icone), 20 px, trait 1,5, toujours avec un texte visible ou un aria-label. Exceptions validées, au nom de la lisibilité : les coches de Checkbox (16 px, trait 3) et de StepIndicator (16 px, trait 2,5), dessinées dans une case pleine.
- Photos réelles de soignants et de patients sénégalais (avec autorisation), jamais d'images IA ni de banque d'images occidentale.
Rayons : 6 px (champs), 10 px (panneaux). Ombres : quasi aucune, sauf les modales. Animations : 150 à 200 ms, ease-out, désactivées si prefers-reduced-motion.
INTERDITS ABSOLUS (signes d'un design généré automatiquement) :
- dégradés violet / bleu, néon, glassmorphism, « blobs » flous en arrière-plan ;
- emojis utilisés comme icônes ; icône sans libellé pour une action importante ;
- héros centré suivi d'une rangée de 3 cartes identiques (icône / titre / texte) ;
- polices Inter, Poppins, Roboto ou Montserrat par défaut ;
- illustrations 3D génériques, personnages « corporate », images générées par IA ;
- slogans creux (« Révolutionnez », « Boostez », « solution tout-en-un innovante ») ;
- fausses statistiques, faux témoignages, compteurs animés inventés ;
- ombres portées et coins très arrondis partout ; tout centrer.
Écriture : phrases courtes, concrètes, vouvoiement, situations réelles (« La maman d'Awa reçoit la veille, sur WhatsApp, le rappel du vaccin de 10 semaines. »).

## 8. Réalités du terrain, à respecter dans chaque écran
- Connexion instable et coupures d'électricité : brouillons automatiques, messages d'erreur rassurants, mode hors-ligne pour les écrans critiques.
- Téléphones Android d'entrée de gamme : pages légères, modules chargés à la demande.
- Un numéro de téléphone est souvent partagé par toute une famille : un patient n'est pas un numéro.
- Beaucoup de patients n'ont ni pièce d'identité ni date de naissance exacte : accepter « âge déclaré » / « né(e) vers ».
- Homonymies fréquentes (Diop, Ndiaye, Fall, Sow…) : rechercher par nom + téléphone + quartier + prénom de la mère.
- Paiements : espèces, Wave, Orange Money, Free Money ; tiers payants (SEN-CSU, mutuelles, IPM, assurances).
- Patients peu ou pas lettrés : posologies illustrées (matin / midi / soir), notes vocales WhatsApp, wolof.
- Impression : A4 / A5 pour les documents, ticket thermique 80 mm pour les reçus et les tickets de file.
- Jours fériés religieux à date variable (Tabaski, Korité, Tamkharit, Gamou, Magal…) saisis chaque année.
- Aucune règle médicale ou tarifaire codée en dur : tout ce qui peut changer (calendrier vaccinal, gratuités, taux, seuils) vit dans des tables paramétrables.

## 9. Langue et formats
- Interface en français. Messages aux patients : français et wolof (modèles), autres langues plus tard.
- Montants : 12 500 FCFA (espace insécable, Intl.NumberFormat('fr-FR')).
- Dates : 13/10/2026, heures 14:30, jours et mois en français.
- Téléphones stockés en E.164 (+221771234567), affichés +221 77 123 45 67.
- Pays UEMOA configurables (indicatif, fuseau horaire, tiers payants). Monnaie : XOF partout.

## 10. Méthode de travail
- On développe ÉTAPE PAR ÉTAPE. Tu ne fais que l'étape demandée, jamais la suivante.
- Avant de coder : lis ce fichier, examine le code existant, puis propose un plan court (fichiers, tables, dépendances). J'approuve, ensuite tu codes.
- S'il manque une information, pose la question au lieu de supposer.
- RÈGLE DE FIN D'ÉTAPE : quand tu as fini, (1) liste les fichiers créés ou modifiés, (2) donne les commandes à lancer (npm, supabase), (3) donne une liste de tests manuels, (4) propose un message de commit, (5) ajoute une ligne au Journal ci-dessous. Puis ARRÊTE-TOI et attends ma validation.
- GIT : commiter seulement après ma validation, puis pousser aussitôt sur GitHub (dépôt github.com/NDIAYE-dotcom/fajkat, branche main). Ne jamais pousser un commit que je n'ai pas validé.

## 11. Journal des étapes

(Ajoute une ligne par étape validée : numéro, date, résumé en une phrase, migrations ajoutées.)

- Étape 0 — CLAUDE.md créé.
- Étape 1 — 13/10/2026 — Projet Vite + React JS initialisé : dépendances, arborescence, client Supabase, utilitaires de formatage, routeur, pages provisoires, ESLint et Prettier. Lint, format et build validés ; aucune migration métier créée.
- Étape 2 — 13/10/2026 — Identité visuelle « registre vivant » (tokens, base, polices) et page d’accueil : choix obligatoire Poste de santé / Clinique, deux pages d’offre distinctes, offres et tarifs centralisés dans src/lib/offres.js, modules marqués « Prévu ». Aucune migration.
- Étape 2b-A — 13/10/2026 — Refonte de la page publique, partie A : écran de choix en scène dessinée au trait (poste / clinique), tracé animé, fiche épinglée, tampon et View Transitions ; SVG remplaçables dans src/assets/illustrations (règle dans docs/illustrations.md). Aucune migration.
- Étape 2c-A — 13/10/2026 — Refonte de la page publique, partie A : en-tête commun avec menu « Plateforme » (3 familles, tiroir plein écran sur mobile) et bouton de démo WhatsApp ; écran de choix en deux panneaux avec aperçus animés en HTML/CSS (file d'attente, plan des lits), 60 / 40 au survol, tampon puis View Transition ; catalogue des 38 modules de la section 6 dans src/lib/modules.js, phares et contact démo dans src/lib/offres.js. Aucune migration.
- Étape 2c-B — 13/10/2026 — Écran de choix refait d'après la maquette docs/references/maquette-choix.png : cartes Poste de santé (sarcelle) / Clinique (--clinique #1062E2) sans prix, bouton « Découvrir toutes les fonctionnalités », illustrations WebP (cercle sur grand écran, bandeau avec images dédiées sur mobile), aperçus animés dans un cadre d'application rejoués au défilement ; exception « page publique » ajoutée en section 7. Aucune migration.
- Étape 2c-C (partie B) — 13/10/2026 — Pages d'offre réunies en un seul composant PageOffre (textes dans PageOffre/contenu.js) : héros avec deux boutons (démo WhatsApp, autre offre) et vignettes flottantes, parcours collant d'un patient fictif (Awa / M. Diop) avec dix fragments d'interface animés, appel à la démo au milieu de page ; bleu Clinique local à la page. Aucune migration.
- Étape 2c-C — 13/10/2026 — Refonte de la page publique, partie C : modules par famille en onglets accessibles (accordéon sur mobile) avec aperçu d'écran de chaque module, tarif en reçu thermique qui sort de l'imprimante, apparitions au défilement (hook useApparition, src/styles/apparition.css), appel final en carte. Aucune migration.
- Étape 2d — 14/10/2026 — Finitions de la page d'accueil : adresses /poste-de-sante et /clinique (anciennes ?offre= redirigées), dernière offre en localStorage (fajkat.offre), comparaison des offres en modale, FAQ par offre, pied de page complet et pages légales provisoires, pages HTML statiques par adresse générées après le build (scripts/pages-statiques.js, données dans src/lib/partage.js) avec sitemap.xml et robots.txt, vercel.json, favicon et images de partage provisoires, chargement à la demande. Aucune migration.
- Étape 2e-A — 14/10/2026 — Design system de l'application, partie A : src/styles/print.css (A4 par défaut, A5 et ticket thermique 80 mm par pages nommées, noir et blanc forcé, tableaux registre à en-têtes répétés, classes .ticket-80__*), jetons d'impression dans tokens.css, utilitaire imprimer(element) dans src/lib/impression.js. Aucune migration.
- Étape 2e-B — 14/10/2026 — Design system de l'application, partie B : 24 composants dans src/components/ui (champs reliés par Field et useChamp, boîte .input partagée, PhoneInput UEMOA en E.164, MoneyInput entier, DateInput avec âge déclaré, Table registre en cartes sous 640 px, Modal et Drawer sur <dialog> via useDialogue, Toast avec useToast, Tabs, Pagination, StepIndicator, Tooltip, Avatar, Skeleton, EmptyState, Spinner), Tampon avec statuts paye / urgent / vaccine / refere / annule, Button avec iconeDebut, chargement et état désactivé, pays UEMOA dans src/lib/pays.js. Aucune migration.
- Étape 2e-C — 14/10/2026 — Design system de l'application, partie C : icônes lucide-react via <Icone> (taille 20, trait 1,5, aria-hidden ou role="img" + aria-label) et <BoutonIcone> (libellé obligatoire, 44 px) ; tous les composants ui migrés ; règle ESLint interdisant size / strokeWidth directs dans ui, modules et Atelier (page publique exclue). Aucune migration.
