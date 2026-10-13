# Illustrations au trait — règle d'export

Les dessins du site public sont des fichiers SVG rangés dans `src/assets/illustrations/`.
Les versions actuelles sont **provisoires**. Pour les remplacer, il suffit d'écraser le fichier
par un export Illustrator portant **le même nom** : aucune ligne de code à modifier.

## Ce que le code impose, quel que soit le fichier

- Trait couleur encre (ou latérite pour les annotations), **1,75 px à l'écran** quelle que soit la
  taille d'affichage, extrémités et angles arrondis, **aucun remplissage**.
- Les couleurs, épaisseurs, classes (`.cls-1`…) et blocs `<style>` du fichier sont ignorés.
- Les éléments `<script>`, `<foreignObject>`, `<title>`, `<desc>`, `<metadata>`, les attributs
  `on…` et les liens externes sont retirés.
- Les traits se dessinent dans l'ordre du fichier : **l'ordre des calques est l'ordre du tracé**
  (le premier calque en bas de la pile dans Illustrator se dessine en premier).

## Règles de dessin

1. **Plan de travail** : garder exactement le `viewBox` indiqué ci-dessous, sinon la ligne de sol
   des deux scènes ne se raccorde plus.
2. **Un calque ou un groupe nommé par élément** (`neem`, `porte`, `banc`…) : le nom devient l'`id`.
   Noms en minuscules, sans accent ni espace (tiret à la place).
3. **Contours seulement** : ne pas vectoriser les traits (pas de « Vectoriser le contour »),
   sinon chaque trait devient une forme pleine et ne peut plus se dessiner.
4. **Pas de texte** dans les dessins : les libellés sont dans la page, traduisibles et lisibles par
   les lecteurs d'écran.
5. Calques réservés :
   - `zone` : un tracé **fermé** qui épouse la silhouette du bâtiment ; il reçoit l'aplat de couleur
     (12 %) au survol. Il n'est jamais tracé.
   - `piece-<code>` (plans de bâtiment, partie B) : une forme fermée par pièce, `<code>` étant le
     code du module (`piece-vaccination`, `piece-laboratoire`…).

## Réglages d'export Illustrator

Fichier › Exporter › Exporter sous… › SVG, puis :

- Styles : **Attributs de présentation**
- Police : sans objet (aucun texte)
- Images : **Incorporer** (en principe aucune)
- ID d'objet : **Noms de calque**
- Décimales : **1**
- Minifier : non · Adaptatif : **coché** (pas de largeur ni de hauteur fixes)

## Fichiers et formats

| Fichier                       | viewBox       | Contenu                                                                                 |
| ----------------------------- | ------------- | --------------------------------------------------------------------------------------- |
| `scene-poste-sante.svg`       | `0 0 600 420` | Poste de santé de quartier : bâtiment bas, neem, banc, moto-ambulance. Sol à `y = 380`. |
| `scene-clinique.svg`          | `0 0 600 420` | Clinique à étages : fenêtres alignées, croix, entrée. Sol à `y = 380`.                  |
| `annotation-soulignement.svg` | `0 0 300 24`  | Soulignement au stylo sous le mot « structure ».                                        |
| `annotation-fleche.svg`       | `0 0 160 140` | Flèche au stylo qui descend vers la scène (pointe en bas à droite).                     |
