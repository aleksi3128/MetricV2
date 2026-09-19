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
| Contre quoi colorer les calories ? | ~~Un objectif dans les réglages~~ → **les propres jours de la plage**, en quartiles (§2) ; `target_calories` reste le repère chiffré | Une clé de plus dans `settings.csv`, et un champ dans `/reglages` |
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
  "level_bounds": [980, 1274, 1777],           // les trois quartiles, vides sous 2 jours
  "days":     [ { "date": …, "calories": …, "protein_g": …, "added_sugar_g": …,
                  "meals": …, "calories_known": …, "state": …, "level": …, "reason": … } ],
  "series":   [ { "date": …, "calories": …, "trend_calories": …, "protein_g": …,
                  "added_sugar_g": …, "days": … } ],
  "stats":    { …, "gap_to_target": -1366 },   // négatif sous l'objectif, null sans mesure
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

`level` va de 1 à 4 selon le **quart de la plage** où tombe la journée. Les trois seuils
sont les quartiles des jours chiffrés, servis dans `level_bounds` ; ce sont des **plafonds
inclus**, donc deux journées à la même valeur reçoivent toujours la même teinte. Plus
foncé veut dire **plus mangé que d'habitude**, jamais « mieux ».

> **Ce n'était pas la première règle.** Les niveaux se lisaient en parts de l'objectif —
> 50 %, 80 %, 105 %. Sur le journal réel qui a motivé le changement, moyenne 1 334 kcal
> contre un objectif à 2 700, **dix-huit jours chiffrés sur vingt-sept tombaient dans la
> teinte la plus pâle** : la grille ne distinguait plus 165 kcal de 1 350, et deux tiers
> de ses cellules avaient la même couleur. Un barème juste dont on ne peut rien lire ne
> vaut pas une échelle relative dont on lit tout — d'autant que la question posée en tête
> de ce document est « est-ce que je mange comme d'habitude ? », à laquelle les quartiles
> répondent et l'objectif non. L'objectif, lui, reste chiffré dans la tuile « Écart »,
> dans l'anneau du jour et dans l'infobulle de chaque cellule.
>
> Sous **deux** jours chiffrés, `level_bounds` est vide : il n'y a pas de distribution à
> découper, et la journée prend le deuxième niveau sur quatre — le premier la dirait
> légère, le dernier copieuse, alors qu'il n'y a rien à quoi la comparer.

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
| Tuiles de plage | 2 (moyenne, écart à l'objectif) | 4 (+ protéines, + sucres au-dessus) |
| Profil de semaine | — | `Bars`, sept jours, pleine largeur |
| Répartition par repas | — | `Bars`, à côté de la grille |

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

---

## 4 bis. Le lot de lisibilité — dix défauts, dont neuf trouvés à l'œil

La section marchait et se lisait mal. Ce qui a changé, et pourquoi :

| Défaut | Ce qu'il donnait à lire | Correctif |
|---|---|---|
| Échelle ancrée sur l'objectif | 18 jours sur 27 dans la même teinte | Quartiles des jours chiffrés (ci-dessus) |
| Légende « moins → plus » | un ordre, aucune quantité | Les trois seuils, en kcal, sous la grille |
| Tendance et protéines toutes deux `effort` en pointillé | **deux traits verts identiques** sur le même tracé | La tendance prend le ton des calories — c'en est |
| Tuile « Dans la cible » | « 0 jour », et rien d'autre à jamais | « Écart » : −1 366 kcal/j, le compte en détail |
| Profil de semaine rapporté au jour le plus copieux | barre pleine à 1 899 kcal pour un objectif de 2 700 | Rapporté à l'objectif, comme la couleur l'était déjà |
| Type de repas sans calorie | une ligne « snack — 0 % » | Filtré côté serveur |
| Graduation basse peinte **sous** la courbe | « 165 » barré par le tracé qui y passe | Graduations peintes en dernier, halo `--surface` |
| Étiquettes d'axe avec l'année | trois `14/08/2026` dans 330 px | `dayMonth` — six étiquettes tiennent |
| Cinq semaines en colonnes | grille deux fois plus haute que large | Un mois se lit en calendrier (ci-dessous) |
| Protéines en couche fantôme | pointillé sans graduation, absent du téléphone | Leur propre courbe, à toutes les largeurs |

Un neuvième est sorti en mesurant : `scrollWidth` compte le débordement de la dernière
étiquette de mois, et « ouvrir sur la fin » décalait donc la grille de six pixels —
« JUIN » s'affichait « UIN ». La grille s'aligne maintenant sur **sa** fin, pas sur celle
du cadre.

### La place, et où elle est passée

Une grille de cinq colonnes ne remplira jamais une carte de 875 px : sept lignes ne
s'élargissent pas sans s'allonger d'autant. C'est donc **la carte qui se règle sur la
grille** — `--top-col`, une largeur par plage — et la colonne de droite qui porte les
tuiles **et** la répartition par type, montée depuis le bas de section. Le profil de la
semaine reste seul, sur toute la largeur.

Le sélecteur de plage a quitté le `CardHead` : il y passait pour un réglage de cette
carte-là, alors qu'il commande aussi les tuiles, la courbe, la répartition et le profil.
Il est posé sur le filet de section, avec ce qu'il commande.

### Un mois se lit en calendrier

Le vrai coupable était la **forme** de la grille, pas la taille de ses cellules. Cinq
semaines posées en colonnes font sept rangées pour cinq colonnes : trop haute sur un
téléphone, trop étroite partout, et aucun réglage de cellule ne rattrape les deux à la
fois — agrandir pour remplir la largeur allongeait d'autant, et 50 px donnaient 374 px de
mosaïque pour cinq semaines.

Tournée d'un quart, la même grille tient en **cinq rangées** et remplit la largeur. Les
sept colonnes se partagent la carte (`repeat(7, 1fr)`, cellules carrées par leur rapport),
donc ~44 px sur l'iPhone visé, ~38 sur un Android de 360 et ~31 dans la colonne d'un écran
large — jamais un chiffre en dur qui déborde ailleurs. C'est en prime la forme qu'un mois
a partout ailleurs, et le plancher tactile est tenu là où il compte.

Le trimestre et l'année gardent les colonnes de semaines : treize et cinquante-trois
colonnes de jours ne se dessinent pas, et c'est bien la largeur qui doit porter le temps
quand il y en a beaucoup. La disposition est un `layout` de `Heatmap`, `weeks` par défaut.

En calendrier, la rangée des mois disparaît — une colonne y vaut « tous les lundis » — et
la carte nomme sa plage en toutes lettres à la place : « du lundi 10 août au dimanche
13 septembre ».

### Les protéines ont enfin une courbe

Elles n'existaient qu'en **couche de contexte** sur la courbe des calories : en pointillé,
sans graduation, avec une seconde échelle muette — et seulement au-delà de 600 px, donc
jamais sur l'écran visé. La seule macro que l'application suit toute la journée dans un
anneau n'avait aucune courbe.

Elle en a une, graduée, à toutes les largeurs : protéines par jour, tendance sur sept jours
calendaires (`trend_protein_g`, même fenêtre et mêmes jours que celle des calories), et
l'objectif en série plate. Une série plate plutôt qu'une graduation : une graduation se lit
comme une valeur atteinte par la courbe, une ligne nommée dans la légende se lit comme un
repère. Le domaine englobe l'objectif, sans quoi une plage entièrement sous la cible
cadrerait sur ses seules valeurs et le repère sortirait du cadre.

Les protéines quittent donc la courbe des calories, qui garde ses calories, sa tendance et
sa bande de sucres.

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
- **La grille de la plage trimestrielle reste vide à gauche** sur un historique de six
  semaines : les colonnes d'avant le premier repas sont des trous, et c'est voulu
  (`HEAT-07`). Le vide est honnête ; le combler demanderait d'inventer des jours.
- **Le dépassement d'objectif d'un jour de semaine se lit au ton, pas à la longueur** :
  `ratio` est plafonné à 1 comme `DayTotals.calories_ratio`. Deux jours à 120 % et à 160 %
  de l'objectif ont donc la même barre, et deux chiffres différents à côté.
