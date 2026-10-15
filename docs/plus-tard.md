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
- **Clôture des passages restés ouverts** en fin de journée (patient parti sans être marqué).
- **Temps d'attente estimé** sur la page de suivi du ticket (QR).
- **Annonce en wolof sur l'écran d'appel** avec une vraie voix sénégalaise enregistrée (lettres, nombres et noms des salles assemblés), qui marche aussi hors ligne. L'annonce en français utilise déjà la synthèse vocale de l'appareil (partie E).
- **Code court d'appairage pour l'écran d'appel** (6 chiffres à saisir sur la télévision, valable quelques minutes) : taper un lien long avec une télécommande est pénible.
- **Priorité proposée d'après le dossier** à l'arrivée (« Enfant de moins de 5 ans » pré-cochée selon l'âge), avec une règle d'âge paramétrable.

## Hébergement

- **Passer à l'offre Pro de Supabase avant une mise en production à grande échelle** : l'offre gratuite limite Realtime à 200 connexions simultanées, en comptant le personnel connecté (tableau de la salle d'attente, cloche) et les écrans d'appel.
