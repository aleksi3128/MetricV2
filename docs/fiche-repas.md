# La fiche d'un repas, et deux valeurs de plus — plan (`NUT-15` → `NUT-17`)

Trois demandes, un seul lot parce qu'elles se rejoignent sur la même surface :

1. **toucher un repas du journal pour voir ce qu'il apporte, et le corriger** (`NUT-15`) ;
2. **relever les acides gras saturés et les fibres** (`NUT-16`), à côté des protéines, des
   sucres et des calories ;
3. **mettre un repas du journal dans les favoris**, pour le rejouer un autre jour
   (`NUT-17`) — demandé en cours de lot, et ajouté à la fiche plutôt qu'ailleurs.

---

## 1. Ce qui manque aujourd'hui

**Un repas enregistré ne se corrige pas depuis l'écran.** `PATCH /api/nutrition/{id}`
existe depuis `NUT-09`, sous garde `If-Match`, et un seul geste s'en sert : accepter
l'estimation d'une photo déjà rangée. Une calorie mal tapée, un type de repas faux, une
description à préciser — rien de tout cela n'a de porte. Il reste à supprimer le repas et à
le ressaisir, ce qui perd sa photo et son heure.

**La ligne du journal dit trois valeurs en police de 12 px**, et rien d'autre. C'est la
bonne densité pour une liste ; ce n'est pas un endroit où lire ce qu'un repas apporte.

**Les acides gras saturés et les fibres ne sont relevés nulle part.** Ni dans `meals.csv`,
ni dans le catalogue d'ingrédients, ni dans ce que rend Open Food Facts — alors que la base
les porte (`saturated-fat_100g`, `fiber_100g`) sur la plupart des produits.

---

## 2. `NUT-15` — la fiche d'un repas

### Ce qui change

- **Le corps de la ligne devient une cible** — vignette, heure, type, description et
  valeurs —, avec le chevron déjà dessiné pour les aliments d'un plat. Il ouvre une
  `Sheet`, comme le nom d'un aliment ouvre sa fiche (`NUT-14`) : même vocabulaire, même
  nom accessible (« Fiche du repas de 12:30 »).
- **La feuille a deux étapes**, et non deux feuilles — le raisonnement de `ScanStep.tsx`
  vaut ici :
  - *lire* : la photo en grand, le type, la description, et **les cinq valeurs** — un tiret
    pour ce qui n'est pas relevé, jamais un zéro ;
  - *corriger* : le type, la description et cinq pas-à-pas. L'enregistrement passe par le
    `PATCH` existant, sous `If-Match`. Un conflit s'affiche et recharge le journal ; il ne
    se force pas.
- **Après correction, la fiche revient à la lecture avec la ligne que le serveur a
  rendue**, pas avec ce que le formulaire contenait : c'est la réponse du `PATCH`, et c'est
  aussi le seul moyen de tenir le nouveau jeton sans relire tout le journal.

### Ce qui ne change pas, et pourquoi

- **La ligne garde ses trois valeurs.** Les cinq y feraient deux lignes par repas dans
  390 px ; la fiche est l'endroit où on vient les lire.
- **La flèche est au bord droit, « supprimer » sur sa propre ligne sous le texte.** Dans
  une première version, « supprimer » gardait sa colonne à droite : la flèche flottait au
  milieu de la carte et la description passait sur deux ou trois lignes. Sous le texte,
  l'action rend 85 px de largeur au repas, et la carte baisse de 156 à 137 px à 402 de
  large.
- **« estimer » reste sur la ligne.** C'est un rattrapage qu'on fait en parcourant le
  journal, et la proposition s'affiche sous le repas qu'elle concerne.
- **La photo et la provenance sont préservées** par le service (`NUT-09`) : corriger une
  estimation ne la transforme pas en saisie manuelle.
- **L'heure ne se corrige pas.** `MealPayload.datetime` l'accepterait, mais composer un
  horodatage à l'écran — le jour de la ligne, l'heure du champ, le décalage du fuseau —
  est exactement le calcul de date que le §2 interdit au client. Il demande une forme de
  requête dédiée côté serveur ; ce lot ne la crée pas.

### Un défaut trouvé en passant, et corrigé

**« supprimer » détruisait un repas au premier appui.** C'est la seule destruction de
l'écran à ne pas suivre la règle des deux appuis — les favoris, trois cartes plus
bas, l'appliquent déjà. Le motif est repris tel quel : premier appui qui arme
(« confirmer ? »), second qui exécute. Élargissement assumé : la ligne est réécrite pour
la fiche, et y laisser une suppression en un appui serait la laisser en connaissance de
cause.

---

## 3. `NUT-16` — acides gras saturés et fibres

### Les colonnes

| Fichier | Colonnes ajoutées | Où |
|---|---|---|
| `nutrition/meals.csv` | `saturated_fat_g`, `fiber_g` | **en fin de ligne**, après `source` |
| `nutrition/favorites.csv` | `saturated_fat_g`, `fiber_g` | en fin de ligne |
| `nutrition/ingredients.csv` | `saturated_fat_100g`, `fiber_100g` | en fin de ligne |

**En fin de ligne, et non à côté des autres valeurs**, parce que ces fichiers s'ouvrent dans
un tableur : une formule qui vise la colonne G doit continuer de viser les calories. Le
dépôt réécrit l'en-tête à la prochaine écriture ; aucune ligne ancienne ne devient
illisible (`STO-04`), elle porte deux cellules vides — « non relevé », et non zéro.

Les jetons de ligne changent au premier chargement après le déploiement (l'empreinte porte
sur toutes les colonnes du modèle). Un écran ouvert avant le déploiement verra donc un
conflit à sa première correction, ce qui est la réponse juste : il n'a jamais lu la ligne
telle qu'elle est.

### Où elles entrent

Partout où une valeur de repas entre déjà — sans quoi on referait le défaut des sucres des
favoris, que `Favorites` raconte en tête de son code :

- **la saisie à la main** et **la correction** : deux pas-à-pas de plus ;
- **l'estimation d'un modèle** : deux clés de plus dans la consigne, relues avec les mêmes
  bornes — hors bornes, écartées et non ramenées ;
- **le code-barres** : `saturated-fat_100g` et `fiber_100g`, bornés à 100 g pour 100 g ;
- **le repas composé** : le serveur multiplie et totalise les deux comme les trois autres,
  et le catalogue les retient ;
- **les favoris** : deux champs de plus, rejoués avec le reste ;
- **l'assistant** : `meal.add` décrit ses arguments depuis `MealPayload`, il les voit donc
  sans rien écrire ; l'exécuteur les transmet.

### Les bornes de saisie (`API-06`)

| Valeur | Par repas | Pour 100 g |
|---|---|---|
| Acides gras saturés | 0 – 300 g | 0 – 100 g |
| Fibres | 0 – 150 g | 0 – 100 g |

Des garde-fous de frappe, pas des bornes physiologiques : 300 g de graisses saturées font
2 700 kcal à eux seuls, 150 g de fibres plus d'un kilo de légumineuses sèches.

### La correction ne doit rien effacer qu'on ne lui a pas donné

`MealPayload` est un remplacement : un champ absent vaut `null`, et `null` efface. Pour les
trois valeurs d'origine, c'est le contrat depuis `NUT-09`. Pour les deux nouvelles, ce
serait une perte silencieuse : **tout appelant écrit avant elles** — un onglet resté ouvert
sur l'ancienne version, un script — effacerait des fibres qu'il ne connaît pas.

Elles suivent donc la règle de `source` dans le même schéma : **absentes, préservées ;
présentes, même à `null`, appliquées.** Le formulaire de correction les envoie toujours.

### Les totaux du jour

Deux tuiles de plus sous les anneaux — « AG saturés » et « Fibres » —, avec **le nombre de
repas qui les portent** (`saturated_fat_known`, `fiber_known`), sur le modèle de
`calories_known`. C'est le point sensible du lot : tous les repas d'avant n'ont ni l'une ni
l'autre, et une somme sur des cellules vides afficherait « 0 g de fibres » un jour de
lentilles. Sans repas chiffré, la tuile dit un tiret.

---

## 4. `NUT-17` — un repas du journal devient favori

**Aujourd'hui**, un repas qu'on remange se retape dans la carte « Repas récurrents » : un
nom et cinq nombres qu'on a déjà sous les yeux dans le journal.

**Ce qui change** : la fiche porte « Ajouter aux favoris », avec une étoile creuse. Un appui,
et le repas entre dans la carte, d'où il se rejoue les jours suivants comme n'importe quel
favori.

**La carte « Repas récurrents » est devenue « Favoris »**, avec une étoile pleine, et a
perdu la phrase qui l'expliquait (« Ce qui revient chaque jour se rejoue en une action… »).
Une étoile se lit sans légende ; la même, creuse ou pleine, marque l'action dans la fiche.
Seul le vocabulaire de l'écran change : l'API et le fichier s'appelaient déjà `favorites`.

- **Aucune route nouvelle.** L'appui passe par `POST /api/nutrition/favorites`, avec les
  valeurs que la fiche affiche — la ligne telle que le serveur l'a rendue. Une route « depuis
  le repas n° 3 » aurait désigné le repas par sa **position**, qui décale à la moindre
  suppression : elle aurait demandé une garde de jeton pour une simple lecture.
- **Sans confirmation** : c'est une addition, et « retirer » la défait dans la carte.
- **Le nom est la description.** Un repas qui n'en a pas ne devient pas favori — la
  fiche le dit, et « Corriger » en ajoute une. En inventer un (« déjeuner du 14/09 ») ferait
  une ligne de carte qu'on ne reconnaît pas.
- **« Dans les favoris »** se lit sur le nom exact. Deux favoris du même nom
  seraient deux « rejouer » indiscernables ; une variante se distingue en renommant.
- **La photo ne suit pas** — un favori n'en porte pas — et le message d'ajout le dit.
- **Le type ne suit pas non plus.** Rejouer un favori prend le type suggéré par l'heure
  (`NUT-10`) : un plat noté au déjeuner et remangé le soir sera un dîner.

Un nom de favori est borné à 80 caractères, une description à 500. Une description plus
longue est refusée par le serveur, et la fiche renvoie vers « Corriger » pour la raccourcir.

---

## 5. Ce que le lot ne fait pas

- **Aucun objectif ni plafond** pour les fibres ou les graisses saturées. Deux réglages,
  deux champs dans `/reglages`, et un choix de référence (ANSES : 30 g de fibres par jour,
  graisses saturées sous 12 % de l'énergie) qui n'est pas technique. Les tuiles disent donc
  un chiffre nu — assumé pour ce lot, à reprendre si les valeurs s'avèrent lues.
- **L'historique, le tableau de bord et le condensé de l'assistant** restent sur les trois
  valeurs d'origine. L'historique a sa propre refonte en cours dans l'arbre de travail.
- **L'heure d'un repas** ne se corrige pas — voir §2.
- **Un favori ne se corrige pas** : il se retire et se recrée, comme avant ce lot.

---

## 6. Ce que ça coûte

- **Backend** : trois modèles, huit schémas, le service, la relecture d'estimation, la
  lecture Open Food Facts, la composition, l'exécuteur de l'assistant. Aucune route nouvelle.
- **Front** : une feuille (`MealDetail.tsx`) et sa logique pure de correction
  (`meal-correction.ts`), une liste des cinq valeurs partagée (`nutrients.ts`) et la grille
  qui les dessine (`NutrientGrid.tsx`), deux pas-à-pas dans la feuille d'ajout, deux champs
  dans les favoris, deux tuiles, une icône d'étoile.
- **Vérification** : tests du domaine (lecture d'un fichier ancien, préservation à la
  correction, totaux connus, Open Food Facts, estimation, composition), tests d'écran de la
  fiche, `make check`, et la fiche **regardée** à 402 px dans les deux thèmes. La fiche
  rejoint la table de `audit-surfaces.mjs`.
