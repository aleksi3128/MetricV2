# Le catalogue alimentaire — plan (`NUT-18` → `NUT-21`)

Quatre demandes, arrivées ensemble :

1. **voir tout ce que je mange**, avec les quantités par jour, semaine, mois et trimestre
   (`NUT-18` pour la donnée, `NUT-19` pour l'écran) ;
2. **ajouter un aliment** qui sera reconnu plus tard dans la feuille « repas composé »,
   sans attendre de l'avoir mangé une fois (`NUT-20`) ;
3. **corriger et supprimer** une entrée du catalogue depuis l'application (`NUT-20`) ;
4. **retenir la portion habituelle** d'un aliment, pour ne pas peser deux fois la même
   chose (`NUT-21`).

---

## 1. Le constat qui décide de tout le reste

`ingredients.csv` existe depuis `NUT-12`, et il est **déjà** ce qu'on appelle ici un
catalogue : un nom, cinq valeurs pour 100 g. Ce qui manque n'est pas le fichier, c'est
tout ce qui l'entoure — il ne s'alimente qu'en sous-produit d'un repas composé, aucune
route n'y écrit directement, et le document de `NUT-12` assume en toutes lettres que « le
fichier s'édite à la main ».

Mais le constat qui coûte est ailleurs. **Les quantités mangées ne sont enregistrées nulle
part.** `create_composed` calcule le total, écrit la ligne du journal, retient les valeurs
pour 100 g… et **jette les lignes**. Il n'existe aujourd'hui aucune trace de « 180 g de riz
le 14 septembre » : ni dans `meals.csv`, qui ne porte qu'un total d'assiette, ni dans
`ingredients.csv`, qui ne porte que des valeurs pour 100 g sans date ni poids.

Trois conséquences, qu'il vaut mieux écrire maintenant que découvrir à l'écran :

- **rien n'est reconstructible.** Aucune quantité passée ne peut être retrouvée, même
  approximativement. L'historique commence au premier repas composé après la livraison ;
- **la vue « trimestre » sera partielle pendant treize semaines.** Elle ne doit pas
  afficher des zéros pendant ce temps — un zéro passerait pour une mesure ;
- **seuls les repas composés portent des aliments.** Photo, saisie manuelle, favori et
  estimation IA n'enregistrent qu'un total. Ils resteront invisibles dans ce catalogue,
  et l'écran doit le dire.

---

## 2. `NUT-18` — le journal des aliments consommés

Un fichier de plus : `nutrition/intake.csv`.

```
datetime, ingredient_id, name, quantity_g
```

C'est une **mesure**, pas un catalogue — à la différence de `favorites.csv` et
`ingredients.csv`. Une ligne illisible n'y est donc pas ignorée en silence : `STO-04` ne
s'applique qu'aux catalogues, et laisser tomber une ligne de mesure ferait mentir une
somme sans prévenir.

### Ce que chaque colonne coûte

**`datetime` est celui du repas**, pas celui de l'écriture. C'est ce qui permet de compter
les repas composés d'une période — le nombre d'horodatages distincts — sans ajouter de
colonne à `meals.csv`, et donc sans changer le sens de la colonne `source` pour les repas
déjà écrits.

**`ingredient_id` peut être vide.** Une ligne sans aucune valeur — « 150 g de légumes » —
n'entre pas au catalogue : elle n'a rien à y apprendre. Elle entre pourtant au journal,
parce qu'elle était dans l'assiette. L'agrégation se rattache donc à l'identifiant quand il
existe, et au **nom réduit** sinon — même casse, mêmes espaces, jamais approximativement.
C'est la règle de `NUT-12`, et il n'y en aura pas une seconde.

**`name` est recopié même quand l'identifiant est là.** Redondant, et voulu : le fichier
s'ouvre dans un tableur, et une colonne d'identifiants hexadécimaux sans nom en face serait
illisible. C'est aussi ce qui sauve l'historique d'une entrée supprimée du catalogue.

### Ordre d'écriture

`repas` → `remember` → `journal des aliments`. Le repas d'abord, pour la raison déjà écrite
dans `NUT-12` : un échec laisserait sinon un catalogue enrichi pour un repas qui n'existe
pas. `remember` ensuite, parce que c'est lui qui attribue les identifiants que le journal
recopie. Le pire cas devient « un repas juste, sans ses lignes au journal » — une quantité
manquante, jamais une quantité fausse.

---

## 3. `NUT-19` — l'écran

Une page, pas une feuille : `/nutrition/catalogue`, atteinte par un bouton en bas de
`/nutrition`. Une feuille se referme, et on y revient pour lire, pas pour saisir.

### Les périodes sont calendaires

Jour en cours, semaine depuis lundi, mois en cours, trimestre en cours. Choix de
l'utilisateur contre les périodes glissantes, et il a une conséquence qu'il faut assumer :
**un 1er du mois affiche presque rien**. C'est cohérent avec la grille de `NUT-11`, qui
compte déjà en semaines pleines alignées sur le lundi.

Les bornes sont calculées **par le serveur**, comme tout le reste. Le client envoie une clé
de plage, il ne sait pas quel jour on est — c'est l'invariant « le jour vient du serveur ».

### La ligne

`4 fois · 720 g` — le nombre de fois d'abord, la quantité ensuite. Un aliment du catalogue
jamais consigné affiche un **tiret**, jamais un zéro, et passe dans une section à part en
bas de liste : « Au catalogue, jamais consigné ».

Tri par **dernier repas**, le plus récent d'abord. La liste répond donc d'abord à « qu'est-ce
que j'ai mangé ces jours-ci », et la quantité est ce qu'on lit une fois la ligne trouvée.

### Deux sortes de lignes, et la seconde n'était pas prévue

Le catalogue d'un côté ; de l'autre, les aliments qui n'existent **qu'au journal**.
« 150 g de légumes » n'a aucune valeur pour 100 g : il n'entre pas au catalogue — il n'y
apprendrait rien — et il a pourtant été mangé. Une page qui promet de montrer *tout* ce
qu'on mange ne peut pas le taire.

Ces lignes portent la mention « hors catalogue », n'ont ni identifiant ni jeton, et
n'offrent donc **rien à détruire** : il n'y a pas de ligne à détruire. Leur fiche propose
de les ajouter au catalogue, avec leur nom déjà repris. C'est le même parti pris que
`LoadList.orphans`, et il vient de la même découverte : ce que l'écran ne montre pas
devient inatteignable.

### Ce que l'écran dit de son propre trou

Une ligne fixe sous les onglets : *« ne compte que les repas composés — 4 repas sur 9 cette
semaine »*. Les deux chiffres viennent du serveur. Sans elle, lire « 0 g de poulet ce
mois-ci » après quatre repas notés en photo serait un mensonge crédible, c'est-à-dire le
pire type.

### La fiche

Toucher une ligne ouvre une `Sheet` — même vocabulaire que la fiche d'un aliment du plat
(`NUT-14`) et que celle d'un repas (`NUT-15`). Elle porte les valeurs pour 100 g, **les
quatre périodes d'un coup**, la portion habituelle, les dix derniers repas où l'aliment est
apparu avec leur date et leur poids, et les touches de correction. C'est ce détail qui rend
les 720 g vérifiables au lieu d'être à croire.

### Quatre états, comme partout

Chargement (`Skeleton`), erreur, vide, données. L'état vide de cette page est particulier :
tant qu'aucun repas composé n'a été enregistré, elle est **structurellement** vide, et le
dire (« l'historique commence au premier repas composé ») vaut mieux que de laisser croire
à une panne.

---

## 4. `NUT-20` — écrire au catalogue

Quatre routes, sous `/api/nutrition/ingredients`.

```
POST   /api/nutrition/ingredients          → Ingredient   ajoute
PATCH  /api/nutrition/ingredients/{id}     → Ingredient   corrige   (If-Match)
DELETE /api/nutrition/ingredients/{id}     → 204          supprime  (If-Match)
GET    /api/nutrition/catalog[/{food_id}]  → la page et la fiche
```

`If-Match` sur les deux écritures destructrices, sans exception : `id` est la position de
la ligne dans le CSV, et une suppression décale tout ce qui suit.

**Deux appuis pour supprimer**, par `SwipeRow` — le projet n'a aucune annulation, et une
entrée supprimée emporte ses valeurs pour 100 g. L'**ajout**, lui, ne se confirme pas :
c'est une addition, elle se défait.

### Un aliment sans aucune valeur est refusé

Le catalogue existe pour remplir des champs. Une entrée sans une seule valeur pour 100 g
ne remplirait rien : elle apparaîtrait dans les suggestions de la feuille « repas
composé », serait choisie, et ne compterait pas dans le total. C'est exactement la règle
que `remember` applique déjà à l'écriture automatique ; la saisie à la main n'a pas de
raison d'être plus permissive.

### Le verrou : une correction à la main tient

Aujourd'hui « la dernière saisie gagne » — un scan écrase les valeurs du catalogue. Avec
une correction possible depuis l'écran, cette règle avalerait le travail de l'utilisateur
au repas suivant, sans rien dire.

Une colonne de plus, `edited_on`. Non vide, elle veut dire « corrigé à la main le … » et
`remember` **ne remplace plus** les valeurs de cette entrée. La fiche l'affiche, et une
touche « Reprendre les valeurs de la base » vide la colonne : le prochain scan reprend la
main. Rien n'est écrasé en silence dans un sens comme dans l'autre.

Deux autres colonnes arrivent en même temps, toutes **en fin de ligne** comme l'exigeait
déjà `NUT-16` pour ne pas casser les formules d'un tableur :

- `barcode` — ce qui permet de reconnaître un produit déjà scanné, et de relire sa fiche
  chez Open Food Facts. La **marque** n'est toujours pas enregistrée : `NUT-13` a tranché,
  elle aide à reconnaître, elle n'est pas une mesure ;
- `portion_g` — voir `NUT-21`.

`remember` doit désormais **fusionner** au lieu de reconstruire : aujourd'hui il réécrit la
ligne entière, ce qui effacerait portion, code-barres et verrou au premier repas suivant.

### Ajouter : scan ou saisie

La même feuille que `NUT-13`, avec son `ScanStep` réemployé tel quel. Un code-barres
remplit les cinq champs ; sinon on tape le nom et ce qu'on sait. Rien d'autre à inventer —
c'est le même geste qu'à la composition d'un plat, et un deuxième vocabulaire pour scanner
serait un vocabulaire de trop.

---

## 5. `NUT-21` — la portion habituelle

`portion_g` au catalogue, renseignée à la main sur la fiche.

**Elle ne préremplit pas le champ de poids.** C'est la seule décision de ce plan qui
s'écarte de ce qui a été demandé, et elle tient à l'invariant : un poids inscrit dans un
champ de saisie sans qu'on l'ait pesé est une valeur inventée à l'écran, et la marquer
comme « proposée » créerait un cinquième vocabulaire de proposition là où le dépôt en
réserve deux à ce que rend un modèle.

Ce qu'elle fait à la place : une **puce sous le champ**, « 125 g », qui remplit le champ
d'un appui. Le geste économisé est le même — on ne retape pas un poids qu'on connaît —,
et rien n'entre dans un champ sans que le doigt l'ait demandé. La puce est absente quand
l'aliment n'a pas de portion enregistrée.

---

## 6. Ce que regarder les captures a trouvé

La batterie était verte et l'audit rendait `0 défaut mesurable` sur la page comme sur ses
deux feuilles, aux trois largeurs. Quatre défauts restaient, tous visibles à l'œil :

- **la grille des valeurs montait en escalier.** « Protéines (g) / 100 g » passait à la
  ligne dans la colonne de gauche et pas dans celle de droite : les champs d'une même
  rangée ne s'alignaient plus. La mention est passée **en tête** du groupe — « pour
  100 g » —, et les étiquettes ont retrouvé une ligne ;
- **les derniers repas n'avaient pas de titre.** Quatre dates alignées sous les quatre
  plages ne disaient pas de quoi elles parlaient ;
- **la puce de portion désalignait la ligne d'ingrédient.** Posée dans la colonne du
  poids, elle en doublait la hauteur et décalait le nom et « retirer ». Elle est devenue
  un item de la grille, sur une deuxième rangée, et la touche « retirer » a été ancrée à
  la première ;
- **un trait de séparation courait plus large que les autres.** Une ligne hors catalogue
  n'a pas de `SwipeRow` autour d'elle, donc pas le rayon qui rogne le bord bas des autres.

Un cinquième est venu de l'audit des surfaces, qui cherche un **nom accessible exact** :
la fiche d'un aliment était introuvable, le nom de sa ligne étant tout son contenu collé.
Elle porte maintenant `aria-label="Fiche de <aliment>"` — et ses deux chiffres sont rendus
par `aria-describedby`, pour qu'un nom stable ne coûte pas ce qu'on entend.

Les deux tables d'audit ont été complétées : `/nutrition/catalogue` dans `audit-mobile.mjs`,
la fiche et la feuille d'ajout dans `SURFACES`.

---

## 7. Ce que ce lot ne fait pas

- **Aucune reconstruction du passé.** Les repas composés d'avant la livraison n'ont pas
  laissé de lignes, et aucune ne sera devinée.
- **Aucune saisie rétroactive.** Écarté par l'utilisateur : un second chemin d'écriture
  ferait double emploi avec le repas déjà noté ce jour-là, et deux chemins donnent deux
  totaux.
- **Les favoris ne portent toujours pas d'aliments.** `favorites.csv` ne stocke qu'un
  total ; leur attacher des lignes est un lot à part entière.
- **Aucune unité autre que le gramme**, comme `NUT-12`. Une portion en pièces demanderait
  une densité ou un poids unitaire par aliment, et ferait de `portion_g` autre chose que
  ce qu'elle est.
- **Aucune fusion de doublons.** « yaourt grec » et « Yaourt Grec » sont la même entrée —
  la casse est réduite —, mais « yaourt grec Lidl » en est une autre. Un rapprochement
  approximatif finirait par attribuer à l'un les calories de l'autre, et c'est refusé ici
  comme ailleurs dans le dépôt.
