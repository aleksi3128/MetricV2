# SplitRow

Le détail d'une séance kilomètre par kilomètre : une barre de vitesse et trois colonnes de chiffres.

- **Le consommateur fournit** : le numéro du km, l'allure, la cadence, la FC moyenne ; la longueur de barre = vitesse du km / vitesse du km le plus rapide.
- La barre est en `red` sur une piste `line-soft` ; les chiffres en `data`, alignés à droite.
- Commence par une ligne d'en-tête (`head`) : km · vitesse · allure · cad. · FC.
