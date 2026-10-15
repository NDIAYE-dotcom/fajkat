# Plus tard — idées d'amélioration

Pendant une étape, on corrige seulement les bugs. Toute idée d'amélioration est notée ici, avec l'étape où elle est apparue, puis traitée quand le porteur du projet le décide.

## Registre des patients

- **Table d'équivalences de prénoms** (Cheikh / Sheikh / Seikh, Abdou / Abdoulaye, Mame / Maam…) pour rapprocher les doublons au-delà de la clé de prononciation. Repoussée à l'étape 11 (partie F).
- **Lecture automatique des registres photographiés** : photographier une page du registre papier et pré-remplir la grille de saisie. Repoussée à l'étape 11 (partie E).

## Accueil et file d'attente (étape 12)

- **Numéro de ticket envoyé par WhatsApp** à l'arrivée. Prévu à l'étape 23.
- **Seuils des constantes de l'enfant par tranche d'âge** (pouls, fréquence respiratoire de la PCIME) ; la fréquence respiratoire n'est pas encore saisie.
- **Part du tiers payant sur le ticket de consultation** (SEN-CSU, mutuelle) : aujourd'hui, le ticket est payé en entier ou gratuit avec un motif.
- **Annulation ou remboursement d'un ticket vendu**, avec motif, à traiter avec la caisse (étape 19).
- **Clôture des passages restés ouverts** en fin de journée (patient parti sans être marqué).
- **Temps d'attente estimé** sur la page de suivi du ticket (QR).
- **Annonce vocale du numéro** sur l'écran d'appel, en français et en wolof.
- **Priorité proposée d'après le dossier** à l'arrivée (« Enfant de moins de 5 ans » pré-cochée selon l'âge), avec une règle d'âge paramétrable.

## Hébergement

- **Passer à l'offre Pro de Supabase avant une mise en production à grande échelle** : l'offre gratuite limite Realtime à 200 connexions simultanées, en comptant le personnel connecté (tableau de la salle d'attente, cloche) et les écrans d'appel.
