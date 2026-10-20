# Plus tard — idées d'amélioration

Pendant une étape, on corrige seulement les bugs. Toute idée d'amélioration est notée ici, avec l'étape où elle est apparue, puis traitée quand le porteur du projet le décide.

## Registre des patients

- **Table d'équivalences de prénoms** (Cheikh / Sheikh / Seikh, Abdou / Abdoulaye, Mame / Maam…) pour rapprocher les doublons au-delà de la clé de prononciation. Repoussée à l'étape 11 (partie F).
- **Lecture automatique des registres photographiés** : photographier une page du registre papier et pré-remplir la grille de saisie. Repoussée à l'étape 11 (partie E).
- **Nom et prénom inversés dans les doublons** : rapprocher « Mousa Diouf » (saisi à l'envers) de « Diouf Moussa ».

## Accueil et file d'attente (étape 12)

- **Numéro de ticket envoyé par WhatsApp** à l'arrivée. Prévu à l'étape 23.
- **Seuils des constantes de l'enfant par tranche d'âge** (pouls, fréquence respiratoire de la PCIME) ; la fréquence respiratoire n'est pas encore saisie.
- **Part du tiers payant sur le ticket de consultation** (SEN-CSU, mutuelle) : aujourd'hui, le ticket est payé en entier ou gratuit avec un motif.
- **Étape 19 (caisse) : annulation d'un ticket vendu par erreur**, réservée à un rôle autorisé, avec motif obligatoire et trace dans le journal, sans jamais supprimer la vente (remboursement éventuel compris).
- **Contrôle d'âge facultatif sur un motif de gratuité** (exemple : « moins de 5 ans » refusé pour un adulte), contre la fraude ; borne d'âge paramétrable par motif.
- ~~Clôture des passages restés ouverts~~ — **réglé à l'étape 14 (correctif)** : la validation d'une consultation termine son passage ; un passage encore ouvert d'un jour passé est clos à la première arrivée du jour dans la structure (« Terminé » s'il était en consultation, sinon « Parti sans être vu », heure de fin : fin du jour du passage).
- **Temps d'attente estimé** sur la page de suivi du ticket (QR).
- **Annonce en wolof sur l'écran d'appel** avec une vraie voix sénégalaise enregistrée (lettres, nombres et noms des salles assemblés), qui marche aussi hors ligne. L'annonce en français utilise déjà la synthèse vocale de l'appareil (partie E).
- **Code court d'appairage pour l'écran d'appel** (6 chiffres à saisir sur la télévision, valable quelques minutes) : taper un lien long avec une télécommande est pénible.
- **Priorité proposée d'après le dossier** à l'arrivée (« Enfant de moins de 5 ans » pré-cochée selon l'âge), avec une règle d'âge paramétrable.

## Rendez-vous et agenda (étape 13)

- ~~Nom de la file « Planification familiale » visible à l'accueil~~ — **réglé à l'étape 13 (partie D)** : au poste de santé, la CPN, la planification familiale et la consultation postnatale arrivent dans une seule file, « Sage-femme » (nouveaux postes, et postes existants dont l'owner n'avait changé ni les noms des files ni la file de ces types ; sinon, la file « Planification familiale » a seulement été renommée « Sage-femme »). L'owner et l'admin la renomment depuis la file d'attente (« Noms des files »). Les cliniques n'ont pas changé : la PF y arrive déjà en « Consultation ».
- **Prestation « Planification familiale » dans Paramètres → Services** (étape 7) : son nom pourra apparaître à la caisse et sur les reçus. À traiter avec la caisse : libellé neutre sur le reçu, ou prestation marquée discrète.
- **Série de rendez-vous** (« tous les 3 mois » pour la PF) dans la fenêtre de prise : la base la gère déjà (book_appointment, p_count) ; l'écran viendra avec la partie E.

## Consultation et dossier médical (étape 14)

- **À FAIRE AVANT LA MISE EN PRODUCTION : faire relire le catalogue des diagnostics par un soignant** (migration `20261020100000_etape14_catalogue.sql`, table `diagnoses_catalog`) : libellés et codes CIM-10, liste et délais des maladies à déclaration obligatoire (à comparer avec la liste nationale du ministère de la Santé), diagnostics marqués sensibles. Corrections par une nouvelle migration ; les consultations déjà validées gardent le code et le libellé du jour.
  - **Question pour le soignant relecteur** : l'épilepsie (G40.9) et la tuberculose (A15.0, A16.2) doivent-elles être marquées sensibles, vu la forte stigmatisation au Sénégal ? Elles ne le sont pas aujourd'hui.
- **Examens rapides et types de consultation par défaut** (TDR VIH et syphilis sensibles, test de grossesse non sensible, PF et dépistage sensibles d'office) : à faire valider par un soignant en même temps que le catalogue.
- **Mots wolof de l'ordonnance à valider** (suba, bëccëg, ngoon, guddi) : proposés par défaut dans src/modules/consultations/ordonnance.js, modifiables dans Paramètres → Ordonnance. Partie D.
- **Étape 31 (super-admin) : gérer les référentiels communs des formes (`drug_forms`) et des voies d'administration (`drug_routes`)** : ajout, renommage, désactivation (is_active), sans suppression ; listes communes à toutes les structures. Partie D.
- **Qualité du praticien sur l'ordonnance** (« Infirmier chef de poste », « Sage-femme d'État ») : la donnée existe (Personnel → fiche du membre → « Fonction », `staff_files.job_title`), mais seuls l'owner, l'admin et la personne elle-même la lisent. L'afficher sous le nom du praticien demande une fonction de lecture (migration proposée le 20/10/2026, en attente de validation). Sinon : étape 21, avec la mise en page définitive. Partie D.
- **Ajouter une ordonnance à une consultation déjà validée** (oubli, renouvellement) : la base le permet (add_prescription), l'écran pas encore. Partie D.
- **Ordonnance depuis le catalogue de la pharmacie** avec le stock visible : étape 17 (clé étrangère sur `prescription_items.product_id`, contrôle du produit dans `encounter_insert_prescription`, lecture de l'ordonnance sans diagnostic par le pharmacien).

## Hébergement

- **Passer à l'offre Pro de Supabase avant une mise en production à grande échelle** : l'offre gratuite limite Realtime à 200 connexions simultanées, en comptant le personnel connecté (tableau de la salle d'attente, cloche) et les écrans d'appel.
  - Si la limite est atteinte, rien ne reste figé : sans canal Realtime, la cloche des notifications (étape 14, partie B), le tableau de la salle d'attente et la page File d'attente se relisent toutes les 60 secondes, au retour du réseau et à chaque retour sur l'onglet ; le canal est rouvert seul 5 secondes après une coupure (src/hooks/useCanalSecours.js, correctif de l'étape 14). L'écran d'appel se relit toutes les 60 secondes même connecté et se reconnecte seul. Vérifié par e2e/repli-temps-reel.spec.js.
  - Chaque appareil en repli fait une lecture par minute : à surveiller si beaucoup d'appareils tombent en même temps (charge de la base).
