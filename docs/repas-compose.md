# Le repas composé — des ingrédients pesés vers un repas

**Note de méthode** : contrairement aux autres documents de `docs/`, celui-ci a été écrit
**après** le code. Le mode est arrivé en cours de lot, en réponse directe à une demande.
Ce qui suit décrit donc ce qui a été livré, pas ce qui avait été prévu.

---

## 1. Le problème

Les quatre modes de saisie demandaient, chacun à leur façon, les macros de l'assiette :
soit un modèle les estimait depuis une photo, soit on les tapait à la main. Or on ne
connaît presque jamais les macros d'une assiette. On connaît celles **de l'emballage**,
pour 100 g, et le poids qu'on en a mis.

Le cinquième mode fait ce passage : un nom de plat, une liste d'ingrédients, et pour
chacun ses valeurs pour 100 g et la quantité. Le total sort de là.

---

## 2. Pourquoi la multiplication est côté serveur

C'est trois lignes d'arithmétique, et c'est exactement ce que le §2 de `CLAUDE.md`
interdit au client. Deux raisons concrètes, pas théoriques :

**L'arrondi.** 179 g de riz à 356 kcal/100 g font 637,24 kcal. Arrondir par ligne puis
sommer, ou sommer puis arrondir, ne donne pas le même nombre. Si l'écran arrondissait de
son côté, le repas enregistré ne correspondrait plus à ce qu'il vient de montrer — et
c'est le genre d'écart d'une kilocalorie qu'on met une heure à expliquer.

**Le second appelant.** L'assistant compose des repas (`IA-05`). S'il refaisait ce calcul
de son côté, la seconde implémentation dériverait de la première au premier cas limite.

Le calcul vit donc dans [`compose.py`](../backend/app/domains/nutrition/compose.py), en
fonction pure, et deux routes l'exposent.

---

## 3. Le contrat

```
POST /api/nutrition/compose     → Composition   (n'écrit rien)
POST /api/nutrition/composed    → Meal          (calcule, enregistre, retient)
```

Les deux prennent les mêmes lignes :

```jsonc
{ "lines": [
    { "name": "riz basmati", "quantity_g": 180,
      "calories_100g": 356, "protein_100g": 8.1, "added_sugar_100g": 0.2 }
] }
```

`/compose` sert le bouton « Calculer le total » : il rend le détail par ligne et le total,
et ne touche à rien. `/composed` y ajoute `meal_type` et `comment` — le nom du plat —,
**recalcule** le total plutôt que de le reprendre du client, écrit la ligne du journal,
puis met le catalogue à jour.

### Trois décisions dans ce contrat

**Les valeurs pour 100 g voyagent avec la ligne**, elles ne sont pas relues au catalogue.
On compose souvent avec un aliment jamais noté — l'obliger à exister d'abord ferait deux
gestes là où il en faut un — et une marque change de recette sans changer de nom. Ce qui
compte, c'est ce qui était écrit sur l'emballage ce jour-là.

**Une ligne sans valeur reste dans le détail.** « 150 g de légumes » n'apporte rien de
connu au total, mais il était dans l'assiette. Le compter pour zéro calorie serait
affirmer qu'il n'en apporte pas, ce qu'on ne sait pas.

**Un plat dont aucune ligne n'est chiffrée arrive au journal sans macros**, pas avec des
zéros. `Composition.empty` le dit, et l'écran l'écrit en toutes lettres.

### Les bornes ne sont pas celles d'une assiette

`Per100Calories` plafonne à 1 000 et `Per100G` à 100. 300 g de protéines dans un repas est
plausible ; pour 100 g d'aliment, non. `QuantityG` est **strictement** positive : un
ingrédient à zéro gramme n'est pas dans le plat.

---

## 4. Le catalogue

`nutrition/ingredients.csv` — `id, name, calories_100g, protein_100g, added_sugar_100g`.
Même nature que `favorites.csv` : un **catalogue**, pas une mesure. Une ligne incomplète
est ignorée à la lecture plutôt que de rendre le fichier illisible (`STO-04`), ce qui
permet de le corriger au tableur — et c'est bien l'usage attendu, un catalogue
d'ingrédients se constituant au fil des courses.

**La dernière saisie gagne.** Un ingrédient déjà connu voit ses valeurs remplacées : on
recompose avec l'emballage qu'on a sous la main, et c'est celui-là qui est juste
aujourd'hui.

**Le rapprochement se fait sur le nom réduit** — même casse, mêmes espaces — et **jamais
approximativement**. C'est la même position que pour les démonstrations d'exercices : deux
yaourts dont les noms diffèrent d'une lettre sont deux produits, et un rapprochement flou
finirait par attribuer à l'un les calories de l'autre.

**Les ingrédients sont retenus après l'écriture du repas.** Dans l'autre ordre, un échec
d'écriture du journal laisserait un catalogue enrichi pour un repas qui n'existe pas.

---

## 5. Ce que l'écran fait, et ne fait pas

Le tableau vit dans [`Ingredients.tsx`](../frontend/src/routes/nutrition/Ingredients.tsx),
ses fonctions pures dans `ingredient-draft.ts` — même séparation que `estimate.ts`.

- **Des blocs, pas des lignes de tableau.** Cinq champs de front demandent 5 × 90 px ;
  dans les 330 px d'une feuille sur téléphone, chacun tomberait à 60 px et « 356 » n'y
  tiendrait pas. Un bloc par ingrédient, deux colonnes de champs, quatre à partir de
  600 px.
- **Le total n'est pas une proposition.** Ni `AiBlock`, ni pas-à-pas `proposed` : c'est
  une multiplication sur des chiffres saisis. Le vocabulaire de la proposition reste
  réservé à ce qu'un modèle rend (§2 de `CLAUDE.md`).
- **Le total se demande, il ne se recalcule pas à chaque frappe.** Cinq champs par
  ingrédient feraient une requête par caractère.
- **Le total est jeté dès qu'une ligne change.** Il appartient aux lignes qui l'ont
  produit ; le laisser à l'écran après une retouche ferait croire qu'on enregistre
  ce chiffre-là.
- **Retirer une ligne ne se confirme pas.** Une addition se défait — c'est la règle du §3
  de `CLAUDE.md` — et rien n'est écrit avant l'enregistrement. La touche est **absente**
  tant qu'il n'y a qu'une ligne, plutôt que grisée : une touche désactivée en permanence
  se lit comme une panne.
- **Le mode reste offert sans clé d'IA**, comme la saisie manuelle : il n'appelle aucun
  modèle (`IA-07`).

---

## 6. Ce qui n'est pas fait

- **Aucune suppression au catalogue.** On peut en ajouter et en corriger — en
  recomposant —, jamais en retirer depuis l'application. Même situation que
  `circuit_loads.csv`, et pour la même raison : la route n'existe pas. Le fichier
  s'édite à la main.
- **Aucune correction d'un repas composé par ses ingrédients.** Les lignes ne sont pas
  conservées avec le repas : seul le total l'est. Corriger un repas composé se fait donc
  comme n'importe quelle correction, sur ses trois macros.
- **Aucune unité autre que le gramme.** Ni pièce, ni cuillère, ni millilitre — une
  conversion demanderait une densité par aliment, que le catalogue ne porte pas.
