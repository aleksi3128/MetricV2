# L'historique de `/nutrition` — grille, courbe, et les calories qui comptent enfin

L'écran Nutrition ne montrait qu'**un** jour : les totaux du jour, le journal du jour, les
repas récurrents. Rien ne répondait à « est-ce que je mange comme d'habitude ? », qui est
pourtant la seule question qu'un suivi alimentaire pose vraiment. Ce lot ajoute la
profondeur : une grille d'un an, une courbe, et deux lectures d'habitude — le jour de la
semaine, et le type de repas.

Il ajoute surtout **un objectif de calories**, qui n'existait nulle part. Les calories
étaient relevées depuis le début, sommées dans les totaux, affichées dans une tuile — et
sans référence. « 2 340 kcal » ne veut rien dire tant qu'on ne sait pas contre quoi le
lire.

---

## 1. Les quatre décisions

| Question | Décision | Ce qu'elle coûte |
|---|---|---|
| Contre quoi colorer les calories ? | Un **objectif dans les réglages**, `target_calories`, 2 200 kcal par défaut | Une clé de plus dans `settings.csv`, et un champ dans `/reglages` |
| Quelle profondeur ? | **Un mois par défaut**, 3 mois et 1 an à un appui | Trois plages à servir, et une grille dont la cellule change de taille |
| Que trace la courbe ? | Calories, tendance, protéines en contexte, sucres en bande | Sur iPhone, les deux dernières couches tombent |
| Un appui sur une case ? | **Rien** — l'infobulle, et c'est tout | Aucune route de lecture d'un jour passé |

La cinquième question ne s'est pas posée : **un jour sans repas consigné n'est pas un jour
à zéro calorie.** `NutritionService.protein_points` le dit déjà en toutes lettres, et la
grille suit la même règle — un tel jour est une cellule neutre, pas un fond clair qui se
lirait comme un jeûne.

---

## 2. Ce que le serveur sert

Une route, une requête, tout ce que la section affiche :

```
GET /api/nutrition/history?range=month|quarter|year
```

```jsonc
{
  "range": "month",
  "from": "2026-08-03", "to": "2026-09-06",   // lundi → dimanche, toujours
  "today": "2026-09-06",
  "granularity": "day",                        // "week" sur la plage annuelle
  "target_calories": 2200,
  "days":     [ { "date": …, "calories": …, "protein_g": …, "added_sugar_g": …,
                  "meals": …, "calories_known": …, "state": …, "level": …, "reason": … } ],
  "series":   [ { "date": …, "calories": …, "trend_calories": …, "protein_g": …,
                  "added_sugar_g": …, "days": … } ],
  "stats":    { … },
  "weekdays": [ { "weekday": 0, "avg_calories": …, "days": … } ],  // 7 entrées, toujours
  "types":    [ { "meal_type": "déjeuner", "calories": …, "share": …, "meals": … } ]
}
```

### Les plages sont des **semaines**, pas des jours

`month` = 5 semaines, `quarter` = 13, `year` = 53. La grille se dessine en colonnes de
sept jours partant du lundi : une plage de « 30 jours » y produirait une première colonne
tronquée, décalée d'un jour par rapport à toutes les autres. C'est exactement l'arbitrage
de `default_range` dans le moteur d'assiduité (**D6**), et pour la même raison — un
décalage d'un jour ne se voit pas et fausse la lecture.

La plage se termine au **dimanche de la semaine en cours**. Les jours à venir existent
dans la grille, en `off`/`future` : en faire des trous donnerait à chaque grille une
entaille hebdomadaire qui ne veut rien dire.

### Les niveaux, et ce qu'ils n'accusent pas

`level` va de 1 à 4 selon la part de l'objectif atteinte. Les bornes sont des **plafonds
inclus** : jusqu'à 50 %, jusqu'à 80 %, jusqu'à 105 %, au-delà — soit 1 100, 1 760 et
2 310 kcal sur un objectif de 2 200. Plus foncé veut dire **plus mangé**, jamais « mieux ».

**La nutrition n'émet ni `missed` ni `bonus`.** Ces deux états du vocabulaire `HEAT-05`
accusent ou félicitent, et aucune journée alimentaire ne mérite l'un ou l'autre depuis une
grille : manger sous l'objectif un jour de repos n'est pas un échec, et le dépasser n'est
pas une réussite. Quatre cas seulement :

| Cas | Rendu |
|---|---|
| Jour chiffré | `done`, niveau 1 à 4 |
| Jour **noté sans calories** | `off` / `unmeasured` — hachuré : on a relevé, on n'a pas chiffré |
| Jour sans repas consigné | `off` — la cellule neutre, celle qui ne dit rien |
| Avant le premier repas, ou à venir | `off` / `before_track` \| `future` |

`unmeasured` est le seul mot ajouté au vocabulaire de la grille. Le hachuré existait déjà
pour les jours neutralisés de l'assiduité ; il dit ici la même chose — ni réussite ni
échec, une case dont on ne peut rien tirer — et le confondre avec « neutralisé » aurait
mis un mot d'assiduité dans une infobulle de nutrition.

### La courbe ne dessine que les jours chiffrés

`series` ne contient **que** les jours (ou semaines) portant au moins une calorie
renseignée. Un jour non chiffré n'y entre pas à zéro — ce serait une valeur inventée — et
n'y entre pas non plus comme un trou, que `Chart` ne sait pas dessiner. La note sous le
graphique dit combien de jours composent la courbe sur combien de jours de plage : c'est
la seule façon honnête de présenter une série trouée.

Sur la plage annuelle, `granularity` passe à `week` : 365 points dans 588 unités de
`viewBox` font une bouillie de 1,6 unité par point, et les barres de la bande passent sous
le pixel. Un point par semaine porte alors la **moyenne des jours chiffrés** de la semaine,
et `trend_calories` vaut `null` — une moyenne glissante d'une moyenne hebdomadaire lisserait
deux fois la même chose.

### Ce que le serveur calcule, et que le client ne recalcule pas

Moyennes de la plage, moyenne par jour de semaine, part de chaque type de repas, tendance
glissante sur sept jours **calendaires** (et non sur sept points, comme la tendance de
poids l'a appris), nombre de jours dans la cible à ±10 %, nombre de jours au-dessus du
plafond de sucres. Le client formate, il ne divise rien.

---

## 3. Ce que l'écran montre, et à quelle largeur

La demande était « détaillé sur iPad et Mac, moins sur iPhone mais quand même
intéressant ». Ce qui tombe sur téléphone n'est jamais un chiffre qu'on aurait ailleurs :
ce sont les couches de contexte et les deux lectures d'habitude, qui demandent une largeur
qu'un téléphone n'a pas.

| | iPhone (390 px) | iPad et Mac (≥ 600 / 960 px) |
|---|---|---|
| Sélecteur de plage | 1 mois · 3 mois · 1 an | idem |
| Grille | cellules **18 px** sur un mois, 14 sur un trimestre, 12 sur l'année | 30, 21 et 13 px — la carte fait 730 px, un timbre-poste s'y perdrait |
| Jours de la semaine | à gauche, **hors du défilement**, sur la seule plage mensuelle | idem |
| Courbe | calories + tendance | + protéines en pointillé, + bande des sucres ajoutés |
| Tuiles de plage | 2 (moyenne, jours dans la cible) | 4 (+ protéines, + jours chiffrés) |
| Profil de semaine | — | `Bars`, sept jours |
| Répartition par repas | — | `Bars`, quatre types |

Le basculement se fait en JavaScript et non en CSS, par un `useMediaQuery` (nouveau,
`lib/media.ts`). Une couche de `Chart` n'a pas de classe qu'une feuille de style
puisse atteindre — elle est dessinée ou elle ne l'est pas. **Sans `matchMedia`, le repli
est le téléphone** : c'est le plancher du projet, pas sa cible.

---

## 4. Ce qui bouge ailleurs

- **`target_calories`** rejoint `settings.csv`, `SettingsValues`, `SettingsPayload` et la
  table des objectifs de `/reglages`. Défaut : 2 200 kcal.
- **`DayTotals`** gagne `calories_target` et `calories_ratio`. La tuile « Calories » du
  jour devient un anneau, à côté de celui des protéines : la journée en cours se lit
  contre la même référence que la grille.
- **`daily_calories`** rejoint le catalogue de `AGG-04`. Huit lignes, et le tableau de bord
  comme les objectifs y gagnent une courbe qu'ils n'avaient pas.
- **`Heatmap`** gagne quatre choses : une légende fournie par l'appelant, une infobulle
  fournie par l'appelant, une colonne de jours de la semaine posée hors du défilement, et
  l'infobulle **au focus** — sans quoi « rien qu'une infobulle » n'aurait rien voulu dire
  au pouce, où il n'y a pas de survol. Elle s'ouvre désormais **sur sa fin** et non sur
  son début : une grille annuelle sur un historique de six mois s'affichait vide, ses
  cellules pleines étant à 400 px hors du cadre. Trouvé en capture, jamais par un test.
- **`Chart`** voit ses textes et ses traits réduits, à la demande. Les graduations passent
  de 26/18/16 à 20/12/10 unités de `viewBox`, les traits s'expriment maintenant en pixels
  d'écran (`vector-effect: non-scaling-stroke`) au lieu de grossir avec le dessin, et la
  gouttière de gauche disparaît — les graduations verticales sont posées **sur** leur
  ligne, à l'intérieur du tracé, ce qui rend 112 unités de largeur au graphique. Il gagne
  aussi `alertAbove`, le pendant d'`alertBelow` : les sucres se guettent par le haut.

---

## 5. Ce que ce lot ne fait pas

- **Aucune lecture d'un jour passé.** L'API ne sait toujours servir que les repas du jour
  courant ; la grille informe, elle n'ouvre pas. C'est la décision prise à la question 4,
  et elle a une conséquence assumée : corriger un repas d'avant-hier reste impossible
  depuis l'application.
- **Aucune suppression, aucune écriture** n'est ajoutée. La section est en lecture seule.
- **Sur téléphone, une graduation d'axe passe sous le plancher de 12 px** du §3 de
  `CLAUDE.md`. C'est la contrepartie assumée de la réduction demandée ; le détail est dans
  le commentaire de `.axis`, et l'infobulle redonne chaque chiffre en entier.
- **La grille ne sait pas colorer autre chose que les calories.** Protéines et sucres sont
  dans l'infobulle et dans la courbe, pas dans un second sélecteur : deux bandes de
  boutons au-dessus d'une grille en auraient fait un tableau de bord, pas une lecture.
- **`target_calories` n'a pas de garde de vraisemblance propre** : il emprunte les bornes
  de `Calories` (0 à 10 000), qui valident une assiette. Un objectif à 80 kcal passerait.
