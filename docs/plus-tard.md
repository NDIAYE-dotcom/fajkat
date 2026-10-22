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
- **Rendez-vous d'un jour passé** (réglé à l'étape 14, partie D) : clos par la base, « Venu (automatique) » si le patient a eu un passage ou une consultation ce jour-là, sinon « Non venu (automatique) ». À faire plus tard :
  - **Étape 16 (vaccination)** : enregistrer une dose de vaccin devra clore le rendez-vous de vaccination correspondant (« Venu »), sans attendre la clôture automatique. La relance des vaccins manqués devra s'appuyer sur les doses réellement enregistrées, pas seulement sur le statut du rendez-vous : un bébé venu le jour de son rendez-vous mais non vacciné (fièvre, rupture de vaccin) est « Venu » et doit quand même être relancé.
  - **Étape 23 (WhatsApp) : champ « Nom de la structure dans les messages »** (par exemple « au poste de santé de Kolda »). Depuis l'étape 15 (partie B1), les rappels disent « un rendez-vous au poste de santé de … » d'après le nom de la structure (`appointment_patient_label`) ; un nom qui ne commence ni par « Poste » ni par « Clinique » (« Darou Salam », « Cabinet du Dr Fall ») donne une tournure maladroite (« au poste de santé Darou Salam »).
  - **Étapes 23-24 (WhatsApp)** : les relances d'absents (vaccins manqués…) devront respecter `appointment_reminder_allowed` (téléphone d'un proche, rendez-vous discret jamais relancé ailleurs que sur le téléphone de la patiente, sans mention du type).
  - **« Venu (automatique) » à corriger** : un rendez-vous noté « Venu » par la base ne se modifie pas aujourd'hui (statut clos, comme « Arrivé »). Si un passage du même jour n'avait rien à voir avec le rendez-vous (enfant venu pour une fièvre, vaccin non fait), prévoir une correction motivée.
- **Série de rendez-vous** (« tous les 3 mois » pour la PF) dans la fenêtre de prise : la base la gère déjà (book_appointment, p_count) ; l'écran viendra avec la partie E.

## Consultation et dossier médical (étape 14)

- **À FAIRE AVANT LA MISE EN PRODUCTION : faire relire le catalogue des diagnostics par un soignant** (migration `20261020100000_etape14_catalogue.sql`, table `diagnoses_catalog`) : libellés et codes CIM-10, liste et délais des maladies à déclaration obligatoire (à comparer avec la liste nationale du ministère de la Santé), diagnostics marqués sensibles. Corrections par une nouvelle migration ; les consultations déjà validées gardent le code et le libellé du jour.
  - **Question pour le soignant relecteur** : l'épilepsie (G40.9) et la tuberculose (A15.0, A16.2) doivent-elles être marquées sensibles, vu la forte stigmatisation au Sénégal ? Elles ne le sont pas aujourd'hui.
- **Examens rapides et types de consultation par défaut** (TDR VIH, syphilis et, depuis l'étape 15 partie B2, hépatite B sensibles ; test de grossesse non sensible ; PF et dépistage sensibles d'office) : à faire valider par un soignant en même temps que le catalogue.
- **Mots wolof de l'ordonnance à valider** (suba, bëccëg, ngoon, guddi) : proposés par défaut dans src/modules/consultations/ordonnance.js, modifiables dans Paramètres → Ordonnance. Partie D.
- **Étape 31 (super-admin) : gérer les référentiels communs des formes (`drug_forms`) et des voies d'administration (`drug_routes`)** : ajout, renommage, désactivation (is_active), sans suppression ; listes communes à toutes les structures. Partie D.
- ~~Qualité du praticien sur l'ordonnance~~ — **réglé** (migration `20261020160000_etape14f_rdv_passes.sql`) : « Fonction » de la fiche du personnel, sinon titre du profil, imprimée sous le nom du praticien. Mise en page définitive à l'étape 21.
- **Faux conflit au rechargement d'une consultation** (vu le 22/10/2026 sous la charge des tests) : si la page est rechargée pendant un enregistrement automatique en cours, la copie de l'appareil garde l'ancienne version et la reprise annonce « Cette consultation a été modifiée sur un autre appareil », alors que tout vient du même appareil. Piste : à la reprise, comparer aussi la copie locale à la dernière version envoyée par cet appareil, ou noter la version attendue avant l'envoi. Rien n'est perdu (choix entre les deux versions), mais le soignant est inquiété pour rien.
- **Ajouter une ordonnance à une consultation déjà validée** (oubli, renouvellement) : la base le permet (add_prescription), l'écran pas encore. Partie D.
- **Étape 22 (signature et cachet) : QR de vérification des certificats** sur la page publique Verifier : le QR imprimé sur le certificat mène à une page qui confirme le numéro (CERT-2026-0001), la structure et la date d'émission, sans le texte ni le nom du patient. Partie E.
- **Ajouter un avenant à un certificat émis par erreur** : aujourd'hui un certificat émis ne se modifie plus et ne s'annule pas ; prévoir une annulation motivée (le numéro reste pris, la vérification par QR affiche « annulé »). Partie E.
- **Lettre de référence de plusieurs pages** : un résumé très long pousse le coupon de contre-référence en page 2 ; la bande pliée de la page 1 reste correcte. Mise en page définitive à l'étape 21. Partie E.
- **Étape 21 : accorder « jour » / « jours » dans le certificat de repos** (« repos de 1 jour », « repos de 3 jours » au lieu de « 3 jour(s) »), d'après le nombre saisi. D'ici là, le texte reste corrigeable à la main avant l'émission. Partie E.
- **Prévenir le référent quand la contre-référence est saisie** (notification) et relancer les références en retard sur la Journée du jour. Partie E.
- **Découper `SaisieConsultation.jsx`** (325 lignes depuis l'étape 15 B2, au-delà des 250 de CLAUDE.md) : sections de la maternité et pied de validation dans des composants à part.
- **Si un rôle non habilité peut un jour valider une consultation, `anc_prescription_check` doit se taire pour lui**, comme le déclencheur `prescription_items_blocked_care` (étape 15, B2, correctif) : aujourd'hui seuls les soignants habilités valident une consultation.
- **Étape 17 (pharmacie) : SP délivrée à une femme sous cotrimoxazole**, à traiter sans rien révéler au pharmacien. Depuis l'étape 15 (B2, correctif), une ligne de SP ajoutée à une ordonnance validée n'est refusée que pour un utilisateur habilité aux données sensibles ; pour un non-habilité (le pharmacien), rien ne change, ni refus ni message.
- **Étape 17 (pharmacie) : reconnaître les noms de marque de la SP** (Fansidar, Maloxine…) par le catalogue des médicaments. Depuis l'étape 15 (B2, correctif), une ligne de SP est refusée sur l'ordonnance d'une patiente sous cotrimoxazole par la clé de « Ajouter à l'ordonnance » ou par le nom « Sulfadoxine-pyriméthamine » (sans majuscules ni accents) ; un nom de marque écrit à la main passe encore.
- **Ordonnance depuis le catalogue de la pharmacie** avec le stock visible : étape 17 (clé étrangère sur `prescription_items.product_id`, contrôle du produit dans `encounter_insert_prescription`, lecture de l'ordonnance sans diagnostic par le pharmacien).

## Santé maternelle (étape 15)

- **À FAIRE AVANT LA MISE EN PRODUCTION : obtenir les « Politiques, normes et protocoles en santé de la reproduction » du Sénégal** (auprès du district sanitaire ou d’une sage-femme), puis faire valider par une sage-femme toutes les valeurs proposées de l’étape 15, aujourd’hui celles de l’OMS. Corrections par une nouvelle migration ; les datations déjà faites gardent leur méthode du jour.
  - Partie A (`maternity_setting_defaults`) : DPA par la règle de Naegele (DDR + 7 jours − 3 mois + 1 an), durée de la grossesse 280 jours (DDR + 280 jours, échographie, estimation), âge gestationnel maximal admis 44 SA (308 jours).
  - Partie B1 (`anc_schedule_contacts`) : modèle « 4 CPN » des postes (cibles 12, 26, 32, 36 SA ; fenêtres jusqu'à 16 SA + 6 j, 28 SA + 6 j, 34 SA + 6 j, 38 SA + 6 j) et « 8 contacts (OMS) » des cliniques (12, 20, 26, 30, 34, 36, 38, 40 SA ; chaque fenêtre finit à la cible + 6 j). Une CPN est « manquée » quand la fenêtre de son contact est passée. Listes de la CPN (`anc_option_templates`) : présentation, œdèmes, protéinurie, glycosurie.
  - Partie B2 (`maternal_intervention_type_templates`, `anc_counselling_topic_templates`, `vaccine_doses`, `anc_test_templates`) : fer et acide folique (60 mg + 0,4 mg, 1 comprimé par jour, 30 jours) ; TPI par sulfadoxine-pyriméthamine à partir de 13 SA, au moins 28 jours entre deux doses, sans nombre maximal (OMS 2012), bloqué sous cotrimoxazole ; moustiquaire imprégnée une fois par grossesse ; déparasitage par mébendazole 500 mg une fois, à partir de 14 SA ; sept thèmes de conseil ; Td 1 à Td 5 (délais 4 semaines, 6 mois, 1 an, 1 an ; protection 0, 3 ans, 5 ans, 10 ans, à vie) ; examens de la grossesse : hémoglobine, glycémie, syphilis, VIH, hépatite B (AgHBs). Délai après la DPA au-delà duquel une grossesse restée « en cours » est tenue pour terminée ailleurs lors d'une fusion de dossiers : 42 jours (`overdue_closure_days`).

## Vaccination (étape 16)

- **Vacciner sans être habilité aux données sensibles** : depuis l'étape 15 (partie B2), noter un vaccin exige `patients_can_read_sensitive` (`vaccination_can_write`). Aujourd'hui l'infirmier est habilité ; prévoir le cas d'un infirmier ou d'un vaccinateur non habilité qui vaccine les enfants (droit de vacciner séparé, sans accès aux données sensibles).
- **Vaccins donnés après une VBG (hépatite B, Td)** : décider s'ils doivent être cachés aux non-habilités. Aujourd'hui (étape 15, partie B2), les vaccins sont lus par tous les rôles médicaux, aide-soignant compris.

## Offre Clinique, après le pilote

- **Téléconsultation** (idée, rien n'est codé) :
  - Niveau 1 : type de rendez-vous « Téléconsultation », paiement avant l'appel, lien vidéo envoyé par WhatsApp, consultation saisie comme d'habitude, ordonnance PDF signée avec QR (étapes 10, 22, 23-24).
  - Niveau 2 : vidéo intégrée à Fajkat (nouvelle dépendance à valider), avec repli en audio seul quand la connexion est faible.
  - À vérifier avant tout : cadre légal de la téléconsultation au Sénégal, consentement du patient, déclaration à la CDP.
  - Variante Poste de santé : téléexpertise de l'ICP vers le médecin du district.

## Hébergement

- **Passer à l'offre Pro de Supabase avant une mise en production à grande échelle** : l'offre gratuite limite Realtime à 200 connexions simultanées, en comptant le personnel connecté (tableau de la salle d'attente, cloche) et les écrans d'appel.
  - Si la limite est atteinte, rien ne reste figé : sans canal Realtime, la cloche des notifications (étape 14, partie B), le tableau de la salle d'attente et la page File d'attente se relisent toutes les 60 secondes, au retour du réseau et à chaque retour sur l'onglet ; le canal est rouvert seul 5 secondes après une coupure (src/hooks/useCanalSecours.js, correctif de l'étape 14). L'écran d'appel se relit toutes les 60 secondes même connecté et se reconnecte seul. Vérifié par e2e/repli-temps-reel.spec.js.
  - Chaque appareil en repli fait une lecture par minute : à surveiller si beaucoup d'appareils tombent en même temps (charge de la base).

## Performance (étape 30)

- **À surveiller : première action après une longue inactivité sur fajkat-dev** (22/10/2026) : un Td d'après le carnet a mis environ une minute à s'enregistrer, première action de la journée après une nuit sans activité ; le lendemain, moins de 2 secondes, et 58 ms en local. Ponctuel pour l'instant ; à mesurer (onglet Réseau, journaux de l'API Supabase) si cela se reproduit.

- ~~`list_appointments` lente~~ — **réglé** (migration `20261021173000_etape13h_perf_agenda.sql`) : les droits étaient recalculés à chaque rendez-vous. Base locale, 325 rendez-vous sur une semaine dont 134 discrets : 250 ms (sage-femme) et 700 ms (accueil) avant, 6 ms après ; `list_patient_appointments` et `appointments_to_remind` corrigées de même. À mesurer aussi sur fajkat-dev.
- **`patient_timeline` à surveiller** : 33 à 48 ms pour 20 lignes (patient de 160 éléments, base locale, 21/10/2026), sous le seuil de 50 ms fixé pour une correction ; à reprendre si elle dépasse.
