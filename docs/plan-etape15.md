# Étape 15 — Santé maternelle (feature `maternite`) : plan validé

Référence de l'étape, à relire après chaque `/clear`. Validé par Ousmane le 21/10/2026.
Une partie = une session de travail, avec sa propre migration (`2026102x_etape15<partie>_….sql`).
Les migrations appliquées sur fajkat-dev ne se modifient jamais.

| Partie | Contenu                                   | État                          |
| ------ | ----------------------------------------- | ----------------------------- |
| A      | Grossesse, datation                       | faite (commit f19f671)        |
| B1     | CPN : modèle, saisie, prochaine CPN       | faite (commit 15ac6d4)        |
| B2     | CPN : traitements préventifs, Td, examens | faite                         |
| C      | Facteurs de risque, signes de danger      | à faire                       |
| D      | Accouchement, partogramme, nouveau-nés    | à faire (rôle matrone inclus) |
| E      | Certificat d'accouchement                 | à faire                       |
| F      | Suites de couches, postnatal              | à faire                       |
| G      | Planification familiale                   | à faire                       |
| H      | Carnet de la mère                         | à faire                       |
| I      | Tableau de bord maternité                 | à faire                       |

## Choix communs

- **Consultations de l'étape 14** : une CPN, un accouchement, une consultation postnatale est
  une consultation (`encounters`) de type `cpn`, `accouchement` ou `postnatal` (nouveaux types,
  recopiés aussi dans les structures existantes ; la PF existe déjà, sensible d'office). On
  garde : brouillon sûr, version contrôlée, reprise, validation qui verrouille, avenants,
  ordonnance, référence, impressions PDF. Le type de rendez-vous `cpn` / `postnatal` choisit
  d'office le type de consultation.
- **Tables d'extension** une ligne par consultation (`anc_visits`, `deliveries`,
  `postnatal_visits`, `fp_events`…), saisies dans le même `draft_data` (clé `maternite`) et
  recopiées à la validation par `encounter_validate_extensions(enc, draft)`, appelée par
  `validate_encounter`.
  - **Remplacement de `validate_encounter` (partie B1)** : recopie à l'identique, ajout du seul
    appel aux extensions, puis différence ligne à ligne montrée à Ousmane.
- **Droits** :
  - lecture `maternity_can_read` (feature + rôles médicaux, aide-soignant compris) ;
  - écriture `maternity_can_write` (médecin, sage-femme, infirmier, owner ou admin qui exerce) ;
  - paramètres `maternity_can_configure` (owner, admin, sage-femme) ;
  - sensible : `patients_can_read_sensitive` + `log_sensitive_opening`.
  - Aucune lecture directe des tables cliniques : fonctions seulement.
- **Paramètres** : `maternity_settings` (une ligne par structure, recopiée de
  `maternity_setting_defaults`), listes en modèles communs `*_templates` recopiés par
  structure. Aucun seuil, intervalle ni liste dans le code. Valeurs de l'OMS marquées
  « à valider » (docs/plus-tard.md), en attendant les « Politiques, normes et protocoles en
  santé de la reproduction » du Sénégal. Un réglage changé ne vaut que pour les saisies
  suivantes.
- **Calculs** dans la base (âge gestationnel, DPA) ; copie JS (`src/modules/maternite/grossesse.js`)
  pour l'affichage pendant la saisie. Contrôle : DDR 01/03/2026 → 08/12/2026 (Naegele : DDR
  - 7 jours − 3 mois + 1 an, dans cet ordre) ou 06/12/2026 (DDR + 280 jours).
- **Journal** : chaque nouvelle table médicale s'inscrit dans `audit_medical_tables` dans sa
  migration (`insert … on conflict do nothing`) ; `audit_table_is_medical` lit ce registre
  (créé en partie A). Audit sans valeur clinique, lu seulement par l'owner ou l'admin qui exerce.
- **Fusion de dossiers** : chaque nouvelle table est rattachée au dossier gardé
  (`patients_merge_relink_*`).
- **Messages aux patients** : jamais l'objet médical. « Vous avez un rendez-vous au poste de
  santé de X le 14/10 à 09:00 ».
- **Tests** : `supabase/tests/etape15<partie>.sql` et `e2e/maternite-<partie>.spec.js` ;
  sage-femme, aide-soignant, accueil, caissier, owner qui n'exerce pas (et matrone dès la
  partie D) ; 360, 768, 1440 px.

## Parties

### A. Grossesse — faite

`maternity_settings` (Naegele ou DDR + N jours, durée 280 jours, terme maximal 44 SA),
`pregnancies` (une seule en cours par patiente, gestité / parité / enfants vivants, retrait
motivé), `pregnancy_datings` en ajout seul (DDR, échographie avec âge lu ou DPA lue,
estimation clinique ; méthode du jour gardée ; datation retenue au choix ; historique). Écart
de terme avec la datation retenue affiché, sans seuil. Groupe sanguin dans `patient_medical`,
antécédents obstétricaux dans `medical_history`. Registre `audit_medical_tables`. Onglet
« Grossesse » de la fiche, page /app/maternite, Paramètres → Maternité.

### B1. CPN : modèle, saisie, prochaine CPN

- Modèles `anc_schedule_models` / `anc_schedule_contacts` (âge gestationnel cible et fenêtre
  de chaque contact) : « 4 CPN » par défaut pour les postes, « 8 contacts OMS » pour les
  cliniques, à valider.
- `anc_visits` (une ligne par consultation CPN) : numéro de CPN d'office, âge gestationnel du
  jour, hauteur utérine, BCF, présentation, œdèmes, protéinurie et glycosurie (listes
  paramétrables). Poids et tension : constantes du passage (`vital_signs`).
- **CPN faite ailleurs** (d'après le carnet, sur le modèle de l'origine des vaccins) : notée
  avec sa date et le lieu, comptée comme faite.
- `anc_status(grossesse)` : CPN attendues à ce jour, faites (validées + faites ailleurs),
  manquées = contacts dont la fenêtre est passée − CPN faites, prochaine attendue. Jamais le
  seul statut des rendez-vous.
- Prochaine CPN calculée et proposée dans « Prochain rendez-vous » (étape 14,
  `schedule_encounter_followup`).
- `encounter_validate_extensions` et remplacement de `validate_encounter` (voir plus haut).
- **Rappels sans type** pour tous les rendez-vous : `appointment_patient_label` ne nomme plus
  le type ; option par type de rendez-vous « Nommer le type dans le rappel », désactivée par
  défaut, impossible pour un type discret (contrainte en base).

### B2. CPN : traitements préventifs, Td, examens

- **Défaut de B1 à corriger dans la migration de B2 : `anc_status` compte les visites au lieu
  des périodes couvertes.** Exemple sur fajkat-dev : TEST Agenda 2 a deux CPN, à 15 et 16 SA,
  toutes deux dans la fenêtre du contact 1 ; l'écran annonce « Prochaine : CPN 3 vers le
  10/02/2027 » et saute le contact de 26 SA. Règle attendue :
  - chaque CPN couvre le contact dont la fenêtre contient son âge gestationnel ;
  - plusieurs CPN dans la même fenêtre ne couvrent qu'un contact ;
  - manquées = contacts dont la fenêtre est passée sans aucune CPN ;
  - prochaine = premier contact non couvert dont la fenêtre n'est pas encore passée ;
  - le numéro de CPN (CPN 1, 2, 3…) reste l'ordre des visites ;
  - même règle dans la copie JS (`prochaineApresBrouillon`, src/modules/maternite/cpn.js) : la
    CPN du brouillon couvre le contact de la fenêtre du jour.

- `maternal_intervention_types` / `maternal_interventions` : fer et acide folique, TPI (doses
  numérotées d'office), moustiquaire, déparasitage ; règles par type (âge gestationnel minimal,
  intervalle minimal, nombre maximal) dans la table. Conseils : `anc_counselling_topics`.
- Bouton « Ajouter à l'ordonnance » : pré-remplit la ligne de l'ordonnance (posologie du type).
- **Td réutilisable par l'étape 16, sans doublon** : `vaccines` (catalogue, Td seul pour
  l'instant), `vaccine_doses` (rang, intervalle minimal), `immunizations` en ajout seul
  (origine « fait ici » ou « d'après le carnet », date approximative acceptée, annulation
  motivée). L'étape 16 ajoutera seulement le calendrier de l'enfant.
- Examens : Hb, glycémie, syphilis, VIH, hépatite B (AgHBs) par `encounter_tests` (liste
  paramétrable `anc_tests`, à valider) et résultats d'un laboratoire extérieur
  (`external_test_results` : date, laboratoire, « résultat externe ») ; groupe sanguin et
  rhésus par `patient_medical`. Liste réservée en entier aux habilités (tout ou rien) ;
  l'aide-soignant ne voit jamais les examens ni les diagnostics d'une CPN, ni à l'écran ni
  dans l'API. Lecture journalisée si un résultat sensible est rendu.
- **Décisions d'Ousmane (21/10/2026)** :
  - âge gestationnel d'une CPN recalculé avec la datation retenue pour le bilan, « SA du
    jour » figé sur la fiche ;
  - vaccins lus par les rôles médicaux (aide-soignant compris), notés par les soignants qui
    rédigent ; rien pour l'accueil, le caissier et l'owner ou l'admin qui n'exerce pas ;
  - « Sous cotrimoxazole » : case de la CPN, situation de la grossesse
    (`pregnancy_conditions`) qui rend la CPN sensible (pas d'autre journal que l'ouverture de
    la CPN) ; blocage de la SP par une règle de la table des soins ; lue seulement dans
    l'écran CPN des habilités. Pour tout non-habilité, et partout ailleurs, une femme sous
    cotrimoxazole ressemble exactement à une femme qui n'a pas encore reçu la SP : même
    statut TPI, mêmes alertes, jamais « bloqué » ;
  - faits ailleurs : TPI (daté) et moustiquaire (case « déjà reçue ailleurs ») ; fer : une
    note suffit ;
  - Td : rang proposé d'office, date exacte, au mois ou à l'année ; lecture la plus prudente
    (date ramenée au premier jour possible : dose suivante proposée au plus tôt, protection
    finie au plus tôt) ; dose saisie par erreur annulée avec un motif, jamais supprimée ;
  - envois répétés (coupure, double clic) sans doublon : identifiant créé sur l'appareil ;
    « Ajouter à l'ordonnance » ajoute au brouillon une ligne à clé fixe par soin.
  - « Sous cotrimoxazole » est une table à part (`pregnancy_conditions`), jamais une colonne
    de `pregnancies` ; la décocher exige un motif (journalisé) ;
  - Td à date approximative affiché à sa précision (« mars 2024 », « 2025 »), jamais comme un
    jour exact ;
  - AgHBs sensible comme le VIH et la syphilis ; un résultat extérieur sensible saisi pendant
    une CPN la rend sensible ; examens journalisés une fois par ouverture de l'écran ;
  - conseils donnés jamais visibles pour l'aide-soignant ;
  - fusion de dossiers jamais refusée à cause d'une donnée médicale : dose de Td en double,
    la plus fiable reste (faite ici avant le carnet, puis la date la plus précise), l'autre
    est annulée « Doublon après fusion », journalisée, sans message.
  - fusion de deux dossiers qui ont chacun une grossesse en cours, sans refus ni message :
    une grossesse au-delà de sa DPA + N jours (`maternity_settings.overdue_closure_days`,
    42 proposés, à valider) est une autre grossesse, terminée ailleurs, close avec le statut
    `ended` (issue non renseignée) ; les deux au-delà : la plus ancienne est close. Sinon,
    même grossesse saisie deux fois : la plus remplie est gardée, CPN, soins, conseils,
    résultats extérieurs, situations et datations (historique) lui sont rattachés,
    cotrimoxazole gardé si l'une l'a ; DDR différentes : repère « Datation à vérifier
    (fusion) » pour les habilités dans l'onglet Grossesse, levé par « J'ai vérifié » ; l'autre
    est retirée « Doublon après fusion », journalisée.

### C. Facteurs de risque et signes de danger

- `pregnancy_risk_types` : facteur ou signe de danger, étapes concernées, action (surveiller,
  référer, référer en urgence), `is_sensitive`, règle automatique facultative dont la valeur
  vit dans la table. Règles activées d'office : âge, parité, Hb, tension (valeurs à valider).
- `pregnancy_risks` (manuel ou automatique, retrait motivé). Tampon « GROSSESSE À RISQUE ».
- Bandeau « Référence recommandée » → fenêtre de référence de l'étape 14 pré-remplie.
- Facteur sensible jamais nommé à l'aide-soignant (tampon sans raison).
- **Anémie de la grossesse** : hémoglobine sous 11 g/dL chez une femme enceinte = anémie,
  seuil paramétrable dans la table, « à valider par une sage-femme » (demande d'Ousmane du
  22/10/2026).

### D. Accouchement et nouveau-nés

- **Rôle matrone** : ajouté aux rôles (membres, invitations, libellé, matrice « Qui peut
  faire quoi ») ; même lecture que l'aide-soignant (clinique, jamais sensible) ; droit limité
  `maternity_can_observe` : points du partogramme et observations du post-partum seulement,
  signés de son nom ; ne valide jamais un accouchement. L'aide-soignant reste en lecture seule.
- `deliveries` (consultation « accouchement » ouverte à l'admission) : heures, lieu (ici,
  domicile, autre structure, en route), mode, délivrance, pertes, périnée, complications
  (listes paramétrables), état de la mère.
- `partograph_entries` en ajout seul, hors brouillon (dilatation, BCF, contractions, liquide) ;
  partogramme SVG fait maison (lignes d'alerte et d'action, réglages dans `maternity_settings`).
- **Résistance aux coupures** (partogramme et post-partum) : un point saisi hors ligne est gardé
  sur l'appareil, renvoyé seul au retour du réseau, avec l'heure réelle de l'observation et non
  celle de l'envoi ; identifiant créé sur l'appareil pour que la base refuse un doublon : jamais
  de perte, jamais de doublon.
- `newborns` : rang, issue, sexe, poids, Apgar 1 / 5 / 10, réanimation, mise au sein précoce,
  vitamine K, collyre.
  - **Mort-né** : aucun dossier patient, seulement la ligne dans `newborns`, comptée dans les
    statistiques.
  - **Né vivant** : dossier créé à la validation, `patients.mother_patient_id`,
    `name_is_provisional`, rattaché au ménage de la mère, téléphone de la mère (titulaire
    « mère ») et **accord WhatsApp de la mère recopié**.
  - **Nom** : champ « nom du père » facultatif ; rempli, c'est le nom de famille du bébé ;
    sinon celui de la mère, marqué provisoire. Affichage « Bébé de Awa Diop » jusqu'au prénom
    (baptême), saisi dans l'onglet Identité.
- **Décès maternel ou néonatal** : alerte urgente de surveillance, sans aucun nom.
- Issue sans accouchement (`close_pregnancy`) : fausse couche, GEU, transfert, perdue de vue.

### E. Certificat d'accouchement

- `birth_certificates` : un par enfant né vivant, CA-AAAA-0001 par structure et par année,
  contenu figé, modèle paramétrable sans variable médicale, prénom « …… » tant qu'il est
  provisoire, champ « père » facultatif.
- Seulement si l'accouchement a eu lieu dans la structure, ou en route avec admission juste
  après.
- PDF A5, zones de signature et cachet réservées (étape 22). L'accueil peut réimprimer un
  duplicata (aucune donnée médicale) ; chaque réimpression est journalisée.

### F. Suites de couches et postnatal

- `postpartum_observations` en ajout seul (rythme paramétrable, résistance aux coupures comme
  le partogramme), heure de sortie.
- `postnatal_schedule_contacts` (24 h, J3, J7–J14, 6 semaines, à valider) : rendez-vous
  proposés d'un coup après l'accouchement ; rappels de l'étape 13 sans type.
- `postnatal_visits` (involution, lochies, périnée, seins et allaitement, signes de danger) et
  `newborn_checks` (examen du bébé dans la même consultation).

### G. Planification familiale (sensible)

- `fp_methods` (intervalle de renouvellement, durée, délai de grâce), `fp_events` en ajout
  seul (adoption, renouvellement, changement, pose, retrait, arrêt), `fp_status`.
- Section PF seulement dans une consultation PF ; onglet « PF » pour les habilités, lecture
  journalisée ; rendez-vous PF discret, rappelé seulement sur le téléphone de la patiente.
- Depuis le postnatal : « Ouvrir une consultation PF » (la consultation postnatale ne nomme
  jamais la méthode).

### H. Carnet de la mère

- `get_maternal_record` ; PDF A4 d'une page : identité, datation, G/P/EV, groupe, antécédents
  obstétricaux, facteurs non sensibles, CPN, TPI, fer, moustiquaire, Td, prochain rendez-vous
  (date et heure), accouchement, nouveau-nés, postnatal.
- **Jamais de version imprimée avec les données sensibles** (VIH, PF, facteurs sensibles) :
  la mère emporte le carnet. Elles restent à l'écran pour les habilités.
- **Conseils donnés jamais imprimés** dans le carnet (un thème comme la PTME ou la PF en dit
  trop) ; ils restent à l'écran pour les habilités (décision du 21/10/2026).

### I. Tableau de bord maternité

- `maternity_dashboard(org, mois)` : grossesses en cours par trimestre (bornes paramétrables),
  à risque, CPN manquées (`anc_status`) et CPN1 tardives, accouchements prévus ce mois, termes
  dépassés sans issue, accouchements réalisés, prénoms à compléter.
- Noms seulement pour les rôles médicaux ; owner ou admin qui n'exerce pas : chiffres seuls ;
  aucune PF.

## Réponses d'Ousmane aux 14 questions (21/10/2026)

1. Rappels : plus aucun type dans les messages, pour tous les rendez-vous ; option par type
   « Nommer le type dans le rappel », désactivée par défaut, impossible pour un type discret
   (partie B1).
2. Paramètres de maternité : owner, admin et sage-femme.
3. Matrone : peut ajouter des points au partogramme et des observations du post-partum, signés
   de son nom, sans valider l'accouchement ; l'aide-soignant reste en lecture seule. Le rôle
   n'existait pas : ajouté en partie D.
4. Pas de document national pour l'instant : valeurs OMS « à valider » ; obtenir les
   « Politiques, normes et protocoles en santé de la reproduction » auprès du district ou d'une
   sage-femme (noté dans docs/plus-tard.md).
5. Datation modifiable, historique gardé.
6. « 4 CPN » pour les postes, « 8 contacts OMS » pour les cliniques, à valider.
7. CPN manquées = contacts dont la fenêtre est passée − CPN faites ; une CPN faite ailleurs
   (d'après le carnet) est notée et comptée comme faite.
8. Fer et acide folique : notés, et bouton « Ajouter à l'ordonnance ».
9. Règles automatiques : âge, parité, Hb, tension, valeurs dans la table, à valider.
10. Mort-né : aucun dossier patient, ligne dans `newborns`, compté dans les statistiques.
11. « Nom du père » facultatif (nom de famille du bébé s'il est rempli, sinon celui de la mère,
    provisoire) ; accord WhatsApp de la mère recopié.
12. Décès maternel ou néonatal : alerte urgente de surveillance, sans nom.
13. Certificat seulement si l'accouchement a eu lieu dans la structure, ou en route avec
    admission juste après ; champ « père » facultatif ; l'accueil réimprime un duplicata,
    chaque réimpression journalisée.
14. Jamais de version imprimée avec les données sensibles.

## Méthode

- Avant chaque partie : relire ce fichier, CLAUDE.md, docs/plus-tard.md, docs/tests-locaux.md.
- Montrer la migration avant les écrans ; pas de `db push` ni de commit sans validation.
- Pendant les corrections : seulement les tests touchés ; suite complète une fois avant le
  commit, sous `caffeinate -i`.
- Rapport : « Vérifié par moi » et « À vérifier par Ousmane » (5 tests au plus).
