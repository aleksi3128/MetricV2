# Les pages Course — ce qu'un `.fit` permet enfin de dire

`/activite/course` montrait une sortie **palier par palier** : huit kilomètres, huit
allures, et beaucoup de phrases pour expliquer comment lire les graphiques. C'était la
bonne page quand les paliers venaient d'une capture Apple. Depuis l'import `.fit`
([`import-fit.md`](import-fit.md)), le serveur tient **un point par seconde** — distance,
position, altitude, vitesse — et la page n'en montrait qu'un tracé monochrome.

Ce lot refait les deux pages autour d'une question chacune :

| Page | La question | Ce qui y répond |
|---|---|---|
| `/activite/course/:id` | **Comment j'ai géré ma course ?** | des phrases calculées, la courbe d'allure au fil des mètres, le tracé coloré, l'intensité |
| `/activite/courses` | **Est-ce que je progresse ?** | les meilleurs efforts par distance, leur progression, le volume par semaine |

---

## 1. Ce que les vrais fichiers contiennent

Les trois `.fit` rangés sur Nextcloud au 13 septembre 2026, relus **en lecture seule**
avant d'écrire une ligne. Tous trois : **Strava sur iPhone**.

| | 11/09 06:59 | 13/09 06:58 | 13/09 07:31 |
|---|---|---|---|
| Points | 1 778, au pas d'une seconde | 1 824 | 1 185 |
| Distance · position · altitude · vitesse | oui | oui | oui |
| Fréquence cardiaque | **non** | **non** | **non** |
| Cadence point par point | **non** — un total de foulées sur la séance | **non** | **non** |
| Pause chronométrée (`event timer stop/start`) | aucune | **une, 81 s** | aucune |
| D+ de la session | 6 m | 24 m | 13 m |

Trois conséquences :

1. **La cadence ne se trace pas** sur ces fichiers. Elle reste une moyenne de séance —
   `total_strides × 2 ÷ minutes` — affichée en tuile. La courbe de cadence et les spm par
   kilomètre apparaissent **dès qu'un fichier les porte** (une montre), et sont éprouvées
   sur des fichiers fabriqués. Rien ne les déduit d'une allure.
2. **Les zones cardio ne se vérifient sur aucun fichier réel.** Elles sont écrites et
   testées ; l'œil ne les a vues que sur une doublure.
3. **Le chronomètre s'arrête parfois.** Toute durée de ce lot se compte en **temps de
   chrono** — l'horodatage moins les pauses —, sans quoi la pause de 81 s du 13/09 fait
   passer les derniers mètres à 20'22"/km.

### Ce que le prototype a montré

Sur les mêmes fichiers, avant de coder :

- Le 13/09 à 06:58 part à **5'01"** sur le deuxième 250 m, puis tombe à **6'53"** au
  kilomètre 1,2. C'est « départ trop rapide, puis coup de mou », et les paliers au
  kilomètre le noyaient dans une moyenne de 5'47".
- Le 11/09 finit ses 250 derniers mètres à **5'13"** pour une moyenne de 5'52".
- Lissée sur 100 m, l'allure change de couleur **81 fois** en 5 km : du bruit GPS. Sur des
  tronçons de 250 m avec un seuil de ±10 s/km, elle change quatre ou cinq fois, et chaque
  changement est une chose qui s'est passée.

---

## 2. Les dix décisions

Prises avec l'utilisateur avant d'écrire.

| | Décision | Ce qu'elle coûte |
|---|---|---|
| **A1** | Les **deux** pages sont refaites | un lot gros ; le plan le découpe en §6 |
| **A2** | Les fichiers **varient** : la page gère cardio présent ou absent | chaque section a un état « le fichier ne le porte pas » |
| **A3** | La page d'une sortie répond à **« comment j'ai géré ma course »** | la régularité en chiffres, le rang parmi les autres courses et la courbe de tendance quittent le haut de la page |
| **A4** | **Peu de texte** : une phrase calculée par constat, plus aucune note de mode d'emploi | les phrases sont écrites **par le serveur**, en français, comme les messages d'erreur |
| **A5** | Les meilleurs efforts sont **calculés à l'import et rangés** dans `run_efforts.csv`, avec un **rattrapage** des `.fit` déjà importés | un CSV de plus, une route d'écriture, et un bouton qui n'apparaît que tant qu'il reste des sorties à rattraper |
| **A6** | Les arrêts sont **montrés**, les données ne changent pas | l'allure stockée reste celle du chrono ; « en mouvement » s'affiche à côté quand elle diffère |
| **A7** | Le tracé est **coloré par allure et lié à la courbe** : toucher la courbe montre où l'on était | le tracé est rééchantillonné sur la même grille que la courbe ; la simplification Ramer–Douglas–Peucker disparaît |
| **A8** | Zones **cardio si le fichier en porte, allure sinon** | deux jeux de zones, deux références |
| **A9** | Les références sont **déduites, et corrigeables** dans les réglages | deux réglages effaçables ; une référence déduite dit toujours d'où elle vient |
| **A10** | Le profil d'altitude **seulement s'il y a du relief** | un seuil, décidé au serveur |

### Pourquoi **A4** ne contredit pas « aucun calcul métier côté client »

Il le renforce. « Départ trop rapide » est un jugement sur des chiffres ; le poser à
l'écran demanderait au client de comparer deux allures et de choisir un seuil. Le serveur
rend donc la phrase entière — `code`, `tone`, `title`, `text` — et l'écran l'affiche telle
quelle. Le client ne décide sur **aucun** des trois derniers champs ; `code` sert aux
tests et à rien d'autre.

Ces phrases **ne sont pas des propositions** au sens du §2 de `CLAUDE.md` : aucun modèle
ne les écrit, elles sortent de règles fixes et se relisent à l'identique à chaque
ouverture. Elles ne portent donc ni `AiBlock` ni l'état `proposed`.

### Pourquoi **A9** ne fabrique pas une valeur inventée

Une allure seuil déduite n'est pas une mesure — c'est une **estimation**, et elle le dit à
chaque affichage : « estimée depuis ton 3 km du 13 sept. ». Une saisie dans les réglages
l'emporte et s'affiche « saisie ». Sans ni l'une ni l'autre, **pas de zones du tout**, et
la carte dit ce que coûte le prochain geste.

---

## 3. Ce que le serveur calcule

Tout vit dans un module **pur**, `domains/activity/analysis.py` : il reçoit la sortie
décodée, il rend une structure. Même coupe que `splits.py` et `progress.py`.

### La grille

Une abscisse **en distance**, au pas de `max(10 m, distance ÷ 300)` arrondi à 5 m : 20 m
pour un 5 km, 145 m pour un marathon. Trois cents points au plus, ce qui suffit à un
dessin de 340 px. À chaque point, le temps de chrono s'interpole entre les deux relevés
qui l'encadrent.

### La courbe d'allure

L'allure d'un point est celle de la **fenêtre de 200 m centrée** sur lui : le temps de
chrono pour la traverser, divisé par 200 m. Sous 200 m, la fenêtre se referme sur ce qui
existe. Les bornes de l'axe écartent les 2 % extrêmes, pour qu'un démarrage GPS à
3'10"/km ne tasse pas toute la courbe en haut.

### Les couleurs du tracé

Par **tronçon de 250 m** (ou `distance ÷ 40` au-delà de 10 km), et non par point : c'est
ce qui a ramené 81 changements de couleur à cinq. Trois classes, contre l'allure moyenne
de la sortie :

| Classe | Écart | Ton |
|---|---|---|
| plus rapide | ≤ −10 s/km | `effort` |
| dans ta moyenne | entre les deux | `ink-mid` |
| plus lent | ≥ +10 s/km | `load` |

### Les arrêts

- **Pause** : un `event timer stop`, puis `start`. Le chrono s'est arrêté ; l'allure n'en
  souffre pas.
- **Arrêt** : quinze secondes ou plus sous 0,5 m/s, chrono en marche — le feu rouge sans
  pause automatique. Il alourdit l'allure, et `moving_pace_min_km` le retire.

### Les phrases

Dans cet ordre, cinq au plus :

| `code` | Quand | Ton |
|---|---|---|
| `fast_start` | premier kilomètre ≥ 12 s/km plus vite que le reste | mauvais |
| `slow_start` | premier kilomètre ≥ 20 s/km plus lent que le reste — un échauffement | neutre |
| `slump` | 500 m les plus lents, hors départ et hors finish, ≥ 20 s/km sous la moyenne | mauvais |
| `split` | seconde moitié vs première : plus rapide, tenue (± 5 s/km) ou plus lente | selon le sens |
| `finish` | 400 derniers mètres ≥ 20 s/km plus vite que la moyenne | bon |
| `record` | un meilleur effort de la sortie bat tous ceux des autres — le plus long seulement | bon |
| `hr_drift` | cardio présent : vitesse par battement perdue entre les deux moitiés, à 5 % | selon le seuil |
| `cadence_drop` | cadence point par point : ≥ 4 spm de moins en seconde moitié | mauvais |
| `stops` | au moins un arrêt ou une pause | neutre |

Toute « moyenne » de ce tableau est l'allure **en mouvement** : un feu rouge ne fait pas
passer le reste de la sortie pour rapide.

Aucune phrase **sous 1,6 km** : une moitié de 800 m ne dit rien de la gestion d'une course.

### Les meilleurs efforts

400 m, 1 km, 3 km, 5 km, 10 km, semi, marathon — le temps de chrono **le plus court**
pour couvrir chaque distance, où qu'elle commence dans la sortie. Deux curseurs sur les
relevés, l'extrémité interpolée : linéaire en nombre de points.

Un trou d'enregistrement rend **zéro effort**, pour la raison qui rend zéro palier
(`fit._has_gap`) : on ne sait pas comment répartir les mètres manquants.

### Les zones

| | Référence | Zones |
|---|---|---|
| Cardio | FC max : réglage `max_hr`, sinon **la plus haute relevée** sur toutes les sorties | 50–60 · 60–70 · 70–80 · 80–90 · ≥ 90 % |
| Allure | allure seuil : réglage `threshold_pace_min_km`, sinon **déduite** | > 129 % · 114–129 · 106–114 · 99–106 · < 99 % du temps au km |

L'allure seuil déduite est celle d'un effort d'**une heure**, prédite par la formule de
Riegel (`t₂ = t₁ × (d₂ ÷ d₁)^1,06`) depuis chaque meilleur effort **de 3 km ou plus** des
90 derniers jours, et l'on garde la plus rapide. Sur les données du 13/09 : 3 km en
14'33" → **5'15"/km**.

La FC max déduite **sous-estime** presque toujours la vraie — elle ne voit que les sorties
faites. La carte le dit, et renvoie aux réglages.

### Le profil d'altitude

Servi seulement si la session déclare **au moins 30 m de D+ et 5 m par kilomètre**. Les
trois fichiers réels n'y arrivent pas — 24 m sur 5 km est du plat. Lissé sur 100 m.

---

## 4. Les surfaces

### Backend

```
domains/activity/fit.py        FitRun.samples · pauses · max_hr ; le tracé RDP part
domains/activity/analysis.py   NOUVEAU — grille, courbe, tracé, arrêts, phrases, efforts, zones
domains/activity/models.py     RunEffortRow ; RunRow.max_hr (colonne en fin d'en-tête, STO-04)
domains/activity/schemas.py    RunAnalysis et ses parties ; RunProgress.records · efforts · weeks
domains/activity/service.py    analysis · rebuild_efforts ; les efforts écrits à l'import
domains/activity/router.py     GET /runs/{id}/analysis (remplace /track) · POST /runs/efforts/rebuild
domains/app_settings/          max_hr · threshold_pace_min_km — effaçables
storage/paths.py               RUN_EFFORTS = "activity/run_efforts.csv"
```

`/runs/{id}/track` **disparaît** : l'analyse porte le tracé, rééchantillonné sur la grille
de la courbe. Garder les deux ferait deux tracés du même fichier, qui ne se superposent pas.

### Frontend

```
components/ui/DistanceProfile.tsx   NOUVEAU — une série sur un axe en kilomètres, curseur partagé
components/ui/Track.tsx             classes de couleur par segment, point actif
features/activity/useRunAnalysis.ts la requête d'analyse, partagée par les tuiles et les sections
routes/activity/Run.tsx             la page d'une sortie : tuiles, puis les sections
routes/activity/run/Analysis.tsx    constats, courbe et tracé, zones, meilleurs efforts
routes/activity/run/Splits.tsx      kilomètre par kilomètre, rang parmi les autres
routes/activity/Runs.tsx            records, progression, volume par semaine, liste
routes/Settings.tsx                 une carte « Course » : FC max, allure seuil
```

`Chart` ne suffisait pas : son abscisse est un **rang**, pas une distance, et il ne sait
ni partager son curseur ni marquer un arrêt à 4,9 km. Le lui apprendre aurait donné deux
graphiques en un, avec deux sortes d'axe à tester pour chaque écran qui s'en sert.

---

## 5. Ce qui n'est pas fait, et pourquoi

- **Pas de fond de carte.** **F3** tient : les coordonnées ne partent chez personne.
- **Pas d'allure corrigée de la pente.** Elle demanderait une altitude fiable, et le §1
  d'`import-fit.md` a mesuré qu'elle ne l'est pas.
- **Pas de prédiction de temps de course.** Riegel sert à situer une zone, pas à promettre
  un chrono : afficher « 10 km en 52'10" » ferait d'une estimation une mesure.
- **Pas de répartition d'intensité sur plusieurs semaines.** Elle dépend d'une référence
  qui bouge ; la ranger figerait l'ancienne, la recalculer relirait chaque `.fit`.
- **Les bandes de distance, la fenêtre glissante et les mois quittent `/activite/courses`.**
  Les meilleurs efforts répondent mieux à la même question : un meilleur 1 km se compare
  d'une sortie à l'autre quelle que soit sa longueur, ce que ni une bande ni une fenêtre ne
  savaient faire. Les champs restent servis tant qu'un autre écran pourrait s'en servir.

---

## 6. L'ordre

1. `analysis.py` et ses tests, sur fichiers fabriqués — pauses, cardio, cadence, trou.
2. `run_efforts.csv`, l'écriture à l'import, le rattrapage.
3. Les routes, les réglages.
4. `DistanceProfile`, `Track`.
5. La page d'une sortie, puis la collection, puis les réglages.
6. `make check`, puis **l'API réelle sur un stockage en mémoire, chargée des trois vrais
   `.fit`** — ce qui montre la page sur de vraies courses sans écrire une ligne sur
   Nextcloud.

---

## 7. Ce que le passage à l'écran a trouvé

L'API réelle, branchée sur un stockage en mémoire chargé d'une **copie** des trois vrais
`.fit` et de `runs.csv` — rien n'a été écrit sur Nextcloud —, regardée à 402 et 360 px,
dans les deux thèmes, et le glissement éprouvé par `Input.dispatchTouchEvent`.

| Trouvé | Corrigé en |
|---|---|
| La courbe d'allure tenait dans **99 px** de haut : à la géométrie de `Chart`, le départ trop rapide du 13/09 se lisait comme une ligne à peine ondulée | tracé presque deux fois plus haut que celui de `Chart` |
| L'étiquette « moy. 6:08 », au bout de la ligne de moyenne, tombait sur la courbe et sur la marque de pause | plus d'étiquette dans le dessin ; la lecture au repos et la légende la nomment |
| Chaque zone prenait trois lignes à 390 px, et la barre un tiers de la carte | nom, bornes et part sur une ligne, la barre pleine largeur dessous |
| « depuis ton 3 km du 13 sept.. » : l'écran ajoutait un point à une phrase qui finit par une abréviation | le serveur rend la phrase **ponctuée**, l'écran n'ajoute rien |
| Les barres de volume ne s'alignaient pas : `Bars` dimensionne la valeur ligne par ligne, et « 0 km » décalait le rail de « 19,2 km · 4× » | les jauges des zones, réemployées |
| **Les records ne comptaient que les sorties `.fit`, sans le dire.** Le 17/08, 6,12 km à 4:44 saisis au clavier ; la table affichait « 5 km en 29:24 » comme le meilleur | une phrase au-dessus de la table |
| La lecture du point écrivait « 5:40 » à côté d'une allure, sans dire que c'était le chrono | « chrono 5:40 » |

Et un défaut **antérieur à ce lot**, trouvé en préparant les données : les paliers découpés
au kilomètre comptaient les pauses du chrono. Le dernier kilomètre du 13/09 affichait 7:31
pour 6:08. Corrigé dans `fit.py`, et réécrit sur les sorties déjà importées par la
réanalyse (**A5**).

### La cadence, demandée en cours de lot

Les spm s'affichent en tuile sur **toutes** les sorties qui en portent — c'est la seule
mesure de foulée d'un export Strava de téléphone, en total de séance. Leur **courbe** au fil
des kilomètres et leur **carte par kilomètre** n'apparaissent que sur un fichier qui porte
la cadence seconde par seconde : une montre. Aucun des trois fichiers réels n'en porte, et
elles ne sont vues que sur des fichiers fabriqués.

### Ce qui reste

- **Deux sorties du même jour** se distinguent mal sur la courbe de progression : deux
  « 13/09 » côte à côte. L'heure les séparerait ; ce n'est pas fait.
- **La FC max déduite et les zones cardio** n'ont été vues sur aucun vrai fichier.
- **Aucun écran n'a été touché sur un vrai téléphone**, comme le reste du projet (§7 de
  `CLAUDE.md`) : le glissement de la courbe à `pan-y` n'est éprouvé qu'en émulation.
