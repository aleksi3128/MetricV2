# Le coach de course — un `.fit` Garmin lu en entier, un matin guidé, la sortie suivante

L'import `.fit` ([`import-fit.md`](import-fit.md)) et les pages Course
([`analyse-course.md`](analyse-course.md)) ont été construits sur trois exports **Strava
d'iPhone** : distance, position, altitude GPS, rien d'autre. Le 19 septembre 2026 arrive le
premier fichier d'une **montre** — une Garmin Epix Pro — et il porte dix fois plus : cardio,
puissance, dynamique de foulée, altitude barométrique, et ce que la montre calcule elle-même.

L'import actuel en garde six champs, découpe la sortie en **miles**, et en tire trois
constats **faux**. Ce lot le répare, puis va où l'utilisateur l'a demandé : une analyse fine,
**corrélée** au reste de ce que Metric sait, et un assistant qui dit **quoi faire à la sortie
suivante** — servi, entre autres, par un parcours guidé chaque matin.

---

## 1. Ce que le fichier contient

`24414861585_ACTIVITY.fit` — l'« Exporter l'original » de Garmin Connect, décompressé.
Décodé avant d'écrire une ligne, comme les deux lots précédents.

| Donnée | Où dans le fichier | Le 19/09 | Statut |
|---|---|---|---|
| FC, seconde par seconde | `record.heart_rate` | 111 → 176, moy. 165 | documenté — **capteur poignet** |
| Puissance | `record.power` | 252 W, NP 253 | documenté — puissance Garmin au poignet |
| Cadence | `record.cadence` + `fractional_cadence` | 168 pas/min | documenté |
| Foulée | `step_length` · `stance_time` · `vertical_oscillation` · `vertical_ratio` | 1,02 m · 270 ms · 9,1 cm · 8,9 % | documenté — **estimé au poignet**, aucun capteur de poitrine |
| Altitude | `enhanced_altitude`, **baromètre** déclaré | D+ 20 m | documenté |
| Effet d'entraînement | `session.total_training_effect` · `total_anaerobic_training_effect` | 3,8 · 0,2 | documenté |
| Charge | `session.training_load_peak` | 130 | documenté |
| Zones de la montre | `time_in_zone` de la session | 86 % en zone 4 | documenté |
| FC max de la montre | `time_in_zone.max_heart_rate` | **202** | documenté |
| Tours | `lap` × 4, `lap_trigger: distance` | 1 609,34 m chacun | documenté |
| Condition de performance | `record` champ **90** · message 140 champ 17 | −3 à 6 min → −8 | **non documenté** |
| Allure corrigée de la pente | `record` champ **140**, en mm/s | ±1 % selon la pente | **non documenté** — suit l'altitude km par km |
| Endurance « stamina » | `record` champ **143** | 82 % → 71 % | **non documenté**, à confirmer |
| VO2max | message **140** champ 7, ÷ 65 536 × 3,5 | ≈ 57,9 | **non documenté**, à confirmer |
| Temps de récupération | message **140** champ 9, en minutes | ≈ 31 h | **non documenté**, à confirmer |
| Meilleurs efforts | message **113** | 1 km 5'35,8 · 5 km 29'06,9 | **non documenté** |
| Ressenti noté sur la montre | `session.workout_feel` · `workout_rpe` | absent | documenté, pas renseigné |

### Ce que l'import actuel en fait

1. **Il découpe en miles.** La montre fait un tour automatique à 1 609,34 m. La garde **F2**
   (« les laps s'ils sont cohérents ») les trouve cohérents — ils le sont — et rend quatre
   paliers de 1,61 km. Un tour **automatique** ne dit rien que le kilomètre ne dise mieux.
2. **Il juge l'allure, et se trompe d'effort.** « Départ trop rapide », « coup de mou au km
   3,2 », « seconde moitié plus lente » : les trois constats sont vrais du chrono et faux de
   l'effort. La puissance est restée entre **250 et 253 W d'un bout à l'autre** ; le km 4
   monte de 5 m. C'est le terrain qui a bougé l'allure, pas la gestion.
3. **Il jette le reste** : puissance, foulée, tout ce que Garmin calcule, et la cadence des
   paliers, que les tours portaient.

### Ce que la sortie dit, et pourquoi la référence est le premier chantier

La FC passe de 111 à 160 en deux minutes — aucun échauffement — et Garmin compte 86 % du
temps en zone 4 pour une allure de footing. Mais ses zones se calculent sur **202**, soit
220 − 18 ans : la formule par défaut. Le VO2max et la condition de performance en dépendent
aussi. **Une référence fausse rend faux tout ce qui s'en déduit**, et plus finement c'est
calculé, plus c'est convaincant.

---

## 2. Les décisions

Prises avec l'utilisateur le 19 septembre 2026, avant d'écrire.

| | Décision | Ce qu'elle coûte |
|---|---|---|
| **C1** | Objectif : **progresser sans échéance** ; la distance travaillée est **choisie par l'assistant** selon le point faible | une règle qui détecte ce point faible (§7) |
| **C2** | Source : **dépôt manuel** du `.fit` ou du `.zip` d'export Garmin. **Pas de synchro** | ni sommeil ni VFC automatiques |
| **C3** | Chaque matin, **FC de repos et VFC**, lues sur la montre, saisies | deux nombres par jour ; un nouveau fichier de mesures |
| **C4** | FC max **déduite d'un effort qualifiant** ; en attendant, **le réglage de la montre** (202), signé | il surestime : les zones seront trop basses jusqu'au premier effort à fond, et l'écran le dit |
| **C5** | Les chiffres Garmin **affichés, signés « selon Garmin »**, et donnés à l'assistant | la lecture de champs non documentés, avec leurs gardes (§3) |
| **C6** | Météo par **Open-Meteo**, position arrondie à 0,1° (~10 km), heure de départ | **amende F3** : c'est la première donnée géographique qui sort du serveur |
| **C7** | La séance : **les règles fixent le cadre, le modèle choisit et rédige dedans** | deux couches à tester ; le serveur rebâtit les cibles |
| **C8** | Quatre surfaces : **page de la sortie, parcours du matin, planning à valider, push la veille** | une seule recommandation rangée, lue par quatre écrans |
| **C9** | La séance en **texte avec cibles toujours**, et en **`.fit` d'entraînement** quand elle a des blocs | un encodeur FIT ; la copie sur la montre passe par OpenMTP sur Mac |
| **C10** | Le **ressenti après la sortie** (effort perçu 1–10) se saisit **dans l'app**, à l'import | un appui de plus à chaque import |
| **C11** | Corrélations : **nutrition, musculation et charge, hydratation et suppléments, poids et heure** — plus la météo et le matin | rien ne s'affiche avant un seuil de sorties comparables (§6) |
| **C12** | Les **glucides** entrent dans les repas **dans un lot à part, après** | la corrélation nutrition se limite aux calories et aux protéines |
| **C13** | Le rythme : **ce que dit le planning** | le coach lit les créneaux `course` ; aucun nombre de sorties fixé |
| **M1** | Un **parcours du matin** guidé, une étape par écran : FC de repos + VFC, pesée, séance du jour, bilan d'hier et journée | une feuille de plus, à ajouter à `audit-surfaces.mjs` |
| **M2** | Fenêtre **6 h – 12 h**, heure du **serveur** | — |
| **C14** | **Jamais deux jours de course d'affilée** : le lendemain d'une sortie reste sans course (20/09/2026) | au plus quatre sorties par semaine ; un créneau `course` du planning qui tombe un lendemain de sortie n'est pas proposé |
| **M3** | Fermé sans finir, il **revient** à l'ouverture suivante, là où il s'était arrêté ; « Pas ce matin » le fait taire jusqu'au lendemain | un petit état par jour, rangé au serveur |

### Pourquoi **C4** ne fabrique pas une valeur inventée

202 n'est pas une mesure, c'est **le réglage de la montre**, et il s'affiche comme tel :
« FC max 202 — réglage de ta montre (220 − âge), tant qu'aucun effort à fond ne l'a
mesurée ». La carte des zones dit ce qui la corrigera. C'est l'inverse d'une valeur
inventée : une valeur **d'origine connue**, dont on dit la faiblesse.

« Déduire de l'historique » change de sens. Jusqu'ici, c'était la plus haute FC relevée
sur toutes les sorties — elle vaudrait **176** aujourd'hui, et classerait en zone 5 une
sortie de 35 min faite 50 s/km plus lentement que celle du 16/09. Désormais, seule compte
une sortie **qualifiante** : effet anaérobie Garmin ≥ 2,5, et effort perçu ≥ 9 dès que sa
saisie existe (**C10**, en **P2**).

Ordre de résolution : réglage saisi → déduite d'un effort qualifiant → réglage de la montre
→ aucune : les zones **repassent à l'allure**, et leur phrase dit pourquoi elles ne sont
pas cardio. Une sortie avec cardio ne perd pas ses zones faute de FC max.

### Pourquoi **C6** amende **F3** plutôt que de la contourner

F3 disait : aucune coordonnée ne part chez un tiers. La chaleur et le vent expliquent
pourtant une FC haute mieux que la fatigue, et la température de la montre (24 → 22 °C) est
celle du **poignet**. Ce qui part : une latitude et une longitude **arrondies au dixième de
degré** — une maille d'environ 10 km —, une date et une heure. Ni le tracé, ni le départ
exact. Le tracé affiché, lui, reste normalisé comme avant.

---

## 3. Lire le fichier en entier — **P1**

### Les tours

Un tour déclenché par la montre — `lap_trigger` à `distance`, `time` ou `position_*` —
n'est gardé **qu'au kilomètre** : c'est alors le kilomètre, avec le dénivelé que la montre
a lissé. À toute autre longueur — le mile du 19/09 —, on découpe au kilomètre. Un tour
**manuel** ou d'entraînement structuré (`wkt_step_index`) garde la règle de **F2**.

Ce que F2 ne sait pas faire reste vrai : des tours **irréguliers** — un fractionné de
400 m et 200 m — repartent au kilomètre, parce que `run_splits.csv` ne porte qu'une
longueur de palier par course. Montrer un fractionné tour par tour attendra **P5**, où le
coach en propose et doit comparer le proposé au fait.

### Les champs documentés

`FitSample` gagne `power_w` et les quatre mesures de foulée ; `FitRun` gagne les totaux
de session. La cadence des paliers se lit dans `lap.avg_running_cadence`.

### Les champs non documentés — quatre règles

1. **Lus par numéro**, dans leur message : `record` champ 90, message 140 champ 7. Un nom
   deviné dans le code serait une documentation inventée.
2. **Une garde de vraisemblance chacun** : VO2max entre 20 et 90, récupération entre 0 et
   96 h, condition de performance entre −20 et +20, stamina entre 0 et 100. Hors bornes,
   **absent** — jamais ramené dans les bornes.
3. **Signés « selon Garmin »** à chaque affichage, et dans le condensé de l'assistant.
4. **Confirmés sur Garmin Connect** pour ce fichier avant d'être montrés (§11). Un champ que
   Connect contredit ne sort pas.

### `activity/run_metrics.csv`

Une ligne par sortie importée, clé `run_id` : puissance moyenne et normalisée, foulée,
effet d'entraînement, charge, récupération, VO2max, condition de performance début et fin,
stamina début et fin, FC max de la montre, découplage, efficacité. **Dérivé du `.fit`, donc
reconstructible** : le bouton de rattrapage d'**A5** le remplit pour les sorties déjà
importées.

Un fichier à part et non des colonnes de `runs.csv`, pour la raison qui sépare
`run_efforts.csv` : `runs.csv` est **saisi** et se corrige au formulaire ; ceci se
**recalcule**. Mêler les deux ferait qu'une correction au formulaire écrase une mesure, ou
l'inverse.

### Les constats jugent l'effort

Quand la puissance couvre la sortie, `fast_start`, `slump`, `split` et `finish` se jugent
sur les **watts** — les seuils de l'allure ramenés en proportion à 6:00/km, soit 3,3 % pour
un départ trop appuyé. Sinon, sur l'allure, comme avant.

L'allure corrigée de la pente (`record` champ 140) est décodable, mais **pas lue** : non
documentée, et la puissance — qui intègre déjà la pente et le vent — suffit à juger
l'effort sur toute montre qui la porte.

Un constat de plus, neutre : `terrain` — « Allure variable, effort constant : 250 à 253 W
d'un bout à l'autre. » C'est ce que la sortie du 19/09 aurait dû dire.

### Deux mesures que Metric calcule

- **Découplage** : puissance (sinon allure corrigée) par battement, première moitié contre
  seconde, **après les dix premières minutes** — l'échauffement fausserait la première
  moitié. Sous 5 %, l'effort aérobie a tenu. Le 19/09 : **0,1 %**.
- **Efficacité** : vitesse corrigée de la pente, en m/min, divisée par la FC moyenne. Seule,
  elle ne dit rien ; sa **tendance** sur les sorties comparables est le meilleur indicateur
  d'une forme aérobie qui monte (§6).

### Le `.zip`

L'« Exporter l'original » de Garmin Connect rend un `.zip`. Il est accepté s'il contient
**un seul** `.fit`, dans la limite de taille de `fit.MAX_BYTES` décompressé — la garde
contre une archive piégée.

---

## 4. Les entrées du quotidien — **P2**

### Le matin : `body/morning.csv`

`date, resting_hr, hrv_ms, source`. Des **mesures** lues sur la montre : la FC de repos du
widget, la VFC moyenne de la nuit. Famille *mesure* du §2 d'`etat-du-projet.md`, rangée
dans le domaine Corps à côté des pesées.

La **référence personnelle** se calcule sur les 28 jours précédents, et n'existe qu'à
partir de **10 matins**. Avant : « encore N matins », et aucun jugement.

| Signal | Seuil | Ce qu'il fait au cadre (§7) |
|---|---|---|
| FC de repos | ≥ +5 bpm sur la référence | la séance dure s'allège |
| FC de repos | ≥ +8 bpm | repos ou récupération seulement |
| VFC | sous la référence − 1 écart type | la séance dure s'allège |

### Après la sortie : `runs.csv.rpe`

Colonne en fin d'en-tête (`STO-04`). Demandée à l'import, deux appuis, passable. Oubliée,
le parcours du lendemain la redemande. Le reste — douleur, sensations — va dans `note`,
qui existe déjà.

### La météo : `activity/run_weather.csv`

`run_id`, température, ressentie, humidité, point de rosée, vent. Demandée à l'import,
**sans bloquer** : cinq secondes au plus, et un échec laisse la ligne absente, rattrapée
par le même bouton qu'**A5**. L'API de prévision pour les sorties récentes, l'archive
au-delà.

**Aucun test ne touche Open-Meteo** — une doublure `httpx.MockTransport` rend les réponses.

---

## 5. Le parcours du matin — **P3**

### Quand il s'ouvre

`GET /api/morning` rend `due`, l'étape où reprendre, et le contenu de chaque étape. Le
**serveur** décide : fenêtre 6 h – 12 h à son heure, ni fini ni reporté ce jour-là. Le
client ne compare aucune heure.

Une étape est **faite** quand sa donnée existe — une FC de repos du jour, une pesée du jour
— pas quand on l'a vue. Ce qui est rangé en plus, dans `routine/morning.csv`, ne dit que ce
que les données ne savent pas : les étapes **passées**, et « Pas ce matin ». Ouvrir l'app à
10 h après s'être pesé à 7 h reprend donc à l'étape suivante, sans rien redemander.

### Les étapes

| | Écran | Ce qu'il demande ou montre |
|---|---|---|
| 1 | **Ta nuit** | FC de repos et VFC, deux `Stepper` **vides** — jamais préremplis de la veille |
| 2 | **Pesée** | le poids, vide ; sautée d'office si la pesée du jour existe |
| 3 | **Ta séance** | la recommandation, **réévaluée sur l'étape 1** ; le fichier pour la montre |
| 4 | **Ta journée** | ce qui manque d'hier (effort perçu d'une sortie, repas), le planning, les suppléments du matin |

Une étape par écran, « étape 2 sur 4 » en tête, « Suivant » à `--tap-lg`, « Passer » sur
chacune. Chaque saisie **s'écrit tout de suite** — c'est une addition, elle n'a pas à être
confirmée — et invalide son domaine et `CROSS_CUTTING`. Fermer au milieu ne perd rien.

Tant que le coach n'existe pas (**P5**), l'étape 3 montre la séance du planning.

### La réévaluation du matin

Elle ne rappelle **pas** le modèle. Les règles du §7 relisent le cadre avec la FC de repos
et la VFC du jour ; si la séance proposée en sort, elle est **allégée par règle** — une
séance dure devient un footing de même durée sous plafond — et la phrase dit pourquoi :
« Allégée ce matin : FC de repos à 56, 7 au-dessus de ta référence. » Cette phrase est une
règle, pas une proposition : elle ne porte pas `AiBlock`.

---

## 6. Charge et corrélations — **P4**

### La charge

Par sortie : les **minutes dans chaque zone, pondérées de 1 à 5**. Zones cardio si le
fichier en porte, d'allure sinon — les deux jeux d'**A8**. Une seule échelle, donc un seul
cumul, calculable aussi sur les sorties d'avant la montre.

- **Charge aiguë** : 7 jours. **Chronique** : moyenne hebdomadaire des 28 jours. Leur rapport
  ne se montre qu'après **21 jours** d'historique.
- **Répartition d'intensité** sur 14 jours : facile (zones 1–2), modéré (3), dur (4–5).
- **Séance dure** : effet aérobie Garmin ≥ 3,5, anaérobie ≥ 2,0, effort perçu ≥ 7, ou
  vingt minutes en zone 4 et plus.

La musculation (Cadence) **n'entre pas** dans ce cumul : elle n'a ni FC ni zones. Elle
entre dans le cadre par une règle à part (§7).

### Les corrélations

**Ce qu'on explique** : l'**efficacité** d'une sortie comparable — cardio présent, vingt
minutes au moins, pas un fractionné —, rapportée à la médiane des 28 jours pour retirer la
tendance de fond. L'allure seule ne se compare pas : elle dépend de ce qu'on voulait faire.

**Par quoi** : chaque sortie reçoit son contexte, figé à l'import.

| Source | Facteur |
|---|---|
| Nutrition | calories et protéines de la veille ; heures depuis le dernier repas |
| Musculation | séance Cadence dans les 48 h, groupes travaillés |
| Hydratation, suppléments | eau de la veille ; supplément pris dans les 3 h avant |
| Poids, heure | W/kg avec la pesée du jour ; matin, midi ou soir |
| Météo | température, point de rosée, vent |
| Matin | FC de repos et VFC contre la référence |

**La méthode** : deux groupes par facteur — oui/non, ou de part et d'autre de la médiane —
et l'écart de leurs moyennes, éprouvé par permutation à graine fixe : la même lecture rend
le même résultat. **Une corrélation ne s'affiche** que si chaque groupe compte **cinq
sorties au moins** et si l'écart passe l'épreuve. Elle se dit « observé », jamais « cause ».

Avant le seuil : « Nutrition — 3 sorties comparables, 10 nécessaires. » Avec une seule sortie
cardio au 19/09, **aucune corrélation ne s'affichera avant plusieurs semaines**, et c'est
voulu : dix points font une droite dans n'importe quelle direction.

---

## 7. Le coach — **P5**

### Le cadre, calculé par règles

| Règle | Source |
|---|---|
| Pas de séance dure avant la fin de la récupération | récupération Garmin, sinon 48 h après une séance dure |
| **Jamais deux jours de course d'affilée** — le lendemain d'une sortie est sans course (**C14**) | les sorties elles-mêmes |
| Deux séances dures à 48 h au moins | §6 |
| Rapport aiguë/chronique ≥ 1,3 : pas de hausse de volume ; ≥ 1,5 : facile seulement | §6 |
| Moins de 70 % de facile sur 14 jours : la prochaine est facile | §6 |
| FC de repos et VFC du matin | §4 |
| Pas de séance dure le lendemain d'une séance de jambes | `circuit_session_sets.csv` |
| Durée ≤ le créneau du planning, et la sortie longue ≤ 110 % de la plus longue des 28 jours | planning, historique |
| Effort qualifiant dû (**C4**) | le cadre propose une séance qui qualifie, si la forme le permet |

Il rend : la date au plus tôt, les **types permis** dans un catalogue fermé — repos,
récupération, footing, sortie longue, progressive, tempo, seuil, fractionné, côtes, test —,
la durée maximale, et les **points faibles** candidats (**C1**) : endurance si le découplage
des sorties longues dépasse 5 %, vitesse si le 5 km tient trop près de la prédiction de
Riegel depuis le 1 km, seuil sinon.

### Le modèle choisit, le serveur chiffre

Le modèle reçoit le cadre et le condensé, et rend un **choix** : type, date, durée,
répétitions, et l'explication. Il **ne rend aucune cible**. Le serveur bâtit les étapes —
échauffement, blocs, récupérations, retour au calme — avec leurs plafonds de FC et leurs
fourchettes d'allure, **tirés des zones**. C'est l'invariant du §2 appliqué au modèle : il
ne fait pas le calcul métier.

Le choix est **vérifié** contre le cadre. Hors cadre : une seconde demande qui nomme la
violation, puis, si elle échoue encore, la séance par défaut des règles, **dite comme
telle**. L'explication est affichée dans `AiBlock` ; les étapes aussi, parce que c'est le
modèle qui les a choisies. Seules les phrases de règle en sortent.

**Aucun test n'appelle OpenRouter** : le client du modèle est remplacé, comme dans le reste
du dépôt. L'application réelle l'appelle à l'import d'une sortie, et nulle part ailleurs.

### `coach/recommendations.csv`

Une recommandation **active** à la fois, l'historique gardé : `proposed`, `accepted`,
`refused`, `done`, `replaced`. Comparer la séance proposée à la sortie faite est la seule
façon de savoir, dans trois mois, si le coach vaut quelque chose.

### Les quatre surfaces (**C8**)

- **Page de la sortie** : une carte « Et maintenant », sous les constats.
- **Parcours du matin**, étape 3, réévaluée (§5).
- **Planning** : la proposition s'y affiche **en fantôme**, hors de `plan.csv`. L'accepter
  écrit une ligne `source=ai` (`PLAN-04`), ou met à jour le créneau `course` du jour sous
  `If-Match`. La refuser ne touche pas au planning. `plan.csv` continue de dire **ce qui est
  prévu** : une proposition ne l'est pas encore.
- **Push la veille**, 20 h 30, s'il y a une séance le lendemain. Une règle de plus dans
  [`notifications-v2.md`](notifications-v2.md), sous ses garde-fous et son quota.

---

## 8. La séance sur la montre — **P6**

Un fichier `workout` : `file_id`, `workout`, une `workout_step` par étape, cibles FC en
`custom_target_heart_rate` (+100, comme le veut le profil) et allure en vitesse. **Encodeur
maison**, sur le modèle de `tests/fit_files.py` : les numéros de champs et les échelles
viennent du profil de `fitdecode`, et chaque test **relit** le fichier écrit avec
`fitdecode`. Trois types de message ne justifient pas une dépendance d'écriture.

`GET /api/coach/recommendations/{id}/workout.fit`. Sur la montre : câble, **OpenMTP** sur
Mac, dossier `GARMIN/NewFiles`. L'écran le dit en une ligne, et le texte avec cibles reste
toujours affiché.

---

## 9. Les surfaces

### Backend

```
domains/activity/fit.py            tours auto ignorés ; puissance, foulée, champs Garmin ; .zip
domains/activity/analysis.py       constats sur l'effort, `terrain` ; découplage ; efficacité
domains/activity/garmin.py         NOUVEAU — les champs non documentés : numéros, gardes
domains/activity/load.py           NOUVEAU — charge, aiguë/chronique, répartition, séance dure
domains/activity/correlations.py   NOUVEAU — contexte d'une sortie, groupes, permutation
domains/activity/weather.py        NOUVEAU — Open-Meteo, arrondi, délai
domains/body/                      MorningRow ; référence de FC de repos et de VFC
domains/morning/                   NOUVEAU — l'état du parcours, `GET /api/morning`
domains/coach/                     NOUVEAU — cadre, choix du modèle, étapes, encodeur workout
domains/notifications/             la règle de la veille
domains/assistant/context.py       les sorties avec leurs chiffres Garmin, signés
storage/paths.py                   RUN_METRICS, RUN_WEATHER, MORNING, MORNING_FLOW, COACH
```

### Frontend

```
routes/activity/run/               puissance et FC sur la courbe, « Foulée », « Selon Garmin »,
                                   « Contexte », « Et maintenant »
routes/activity/Runs.tsx           charge, répartition, efficacité, corrélations
app/MorningFlow.tsx                la feuille du matin, montée par Shell
routes/Planning.tsx                la proposition en fantôme
scripts/audit-surfaces.mjs         la feuille du matin, à 402, 390 et 360 px
```

---

## 10. Ce que ce lot ne fait pas

- **Pas de synchro Garmin** (**C2**) : ni sommeil, ni Body Battery, ni stress.
- **Pas de glucides** (**C12**) : lot suivant.
- **Pas de zones de puissance.** Le seuil de 376 W est une estimation de la montre ; des
  zones dessus seraient une seconde référence fausse à côté de la première.
- **Pas d'équilibre gauche/droite** : il demande une ceinture cardio que le fichier ne
  déclare pas.
- **Toujours pas de prédiction de chrono** (`analyse-course.md` §5) : Riegel situe un point
  faible, il ne promet pas un temps.
- **Pas d'avis médical** (`IA-12`). Une douleur notée ne déclenche aucune règle ; le modèle
  la lit et renvoie vers un professionnel, comme ailleurs.

---

## 11. Ordre et vérification

| | Phase | Vérifié par |
|---|---|---|
| **P1** | Le fichier Garmin lu en entier, `run_metrics.csv`, FC max **C4**, constats sur l'effort, `.zip` | fichiers fabriqués ; **le vrai `.fit` sur un stockage en mémoire**, jamais versionné |
| **P2** | Matin, effort perçu, météo | doublure Open-Meteo |
| **P3** | Le parcours du matin | horloge du serveur figée à 5 h 59, 6 h, 11 h 59, 12 h |
| **P4** | Charge, corrélations | séries fabriquées où l'effet est connu, et où il n'y en a aucun |
| **P5** | Le coach et ses quatre surfaces | modèle remplacé ; choix hors cadre, deux fois |
| **P6** | L'encodeur `workout` | aller-retour `fitdecode` |

Chaque phase se ferme sur `make check`, puis **les écrans regardés** — API réelle sur un
stockage en mémoire chargé d'une copie des vrais fichiers, 402 et 360 px, deux thèmes — et
`audit-surfaces.mjs` pour toute feuille nouvelle.

### À confirmer sur Garmin Connect avant de montrer les champs non documentés

Pour la sortie du 19/09 à 7 h 07 : **VO2max**, **temps de récupération**, **condition de
performance**, **endurance (stamina)** de début et de fin, **meilleurs efforts**. Ce que le
§1 en lit est ≈ 57,9 · 31 h · −7 · 82 % → 71 % · 1 km en 5'36".


---

## 12. Journal

### P1 — le fichier Garmin lu en entier (19 septembre 2026)

Livré tel que le §3 le décrit, aux deux écarts près notés ci-dessus : les tours
irréguliers et l'allure corrigée de la pente. Et un ajout, décidé en l'écrivant :
**`garmin.CONFIRMED`**. La règle 4 disait « confirmés avant d'être montrés » ; elle est
devenue une liste dans le code, **vide** tant que l'utilisateur n'a pas lu Garmin Connect.
Un champ non confirmé est décodé et rangé dans `run_metrics.csv`, mais ni affiché ni
transmis à l'assistant. La carte « Selon ta montre » du 19/09 montre donc l'effet
d'entraînement et la charge — documentés — et rien d'autre.

Sur la vraie sortie, les trois constats faux deviennent :

| Avant | Après |
|---|---|
| Départ trop rapide | — |
| Coup de mou du km 3,2 au km 3,7 | — |
| Seconde moitié plus lente | **Effort tenu** — 252 puis 252 W |
| — | **Allure variable, effort constant** — 250 à 253 W pour 5:36 à 6:02 |
| Cardio stable, 163 puis 167 bpm | **Cardio stable** — puissance par battement, 0,1 %, échauffement exclu |

`make check` : 1 920 tests backend (+30), 659 d'écran (+6).

#### Ce que le passage à l'écran a trouvé

L'API réelle, sur un stockage en mémoire chargé d'une **copie** de `runs.csv`, des paliers,
des efforts et des trois `.fit` Strava, plus la sortie Garmin importée par le vrai service.
Regardée à 402, 390 et 360 px, dans les deux thèmes ; le sélecteur éprouvé par
`Input.dispatchTouchEvent`. La sonde d'`audit-mobile.mjs` : aucune cible sous 44 px, aucun
débordement, aucun texte HTML sous 12 px. Quatre défauts, tous à l'œil :

| Trouvé | Corrigé en |
|---|---|
| Le sélecteur FC · Puissance · Cadence, posé en tête de carte, **touchait le cercle de départ** du tracé — et se lisait comme un réglage du tracé | au-dessus de la courbe qu'il pilote |
| La foulée affichait « −1 ms en fin de sortie » : du bruit d'estimation au poignet, présenté comme un signe de fatigue — et la ligne coupait « Longueur de pas » en deux à 402 px | écarts sous `STRIDE_NOISE` tus **par le serveur** ; l'écart passe sous la valeur |
| La courbe de puissance, cadrée sur son min–max, remplissait le dessin avec ±3 % : **l'image contredisait « effort constant »** écrit au-dessus | cadre d'au moins ±15 % autour de la moyenne, décidé au serveur |
| « pas par Metric » puis « : ce sont… » en début de ligne | espace insécable avant les deux-points, dans les phrases de ce lot |

Un test d'écran écrit pour ce lot oubliait `If-Match` sur `PATCH /api/settings` — la garde a
répondu `428`, comme elle le doit, et c'est le test qui a été corrigé.

#### Laissé, et pourquoi

- **Les graduations de la courbe rendent 9,3 px à 402 px.** Compromis documenté dans
  `Chart.module.css`, antérieur à ce lot ; `DistanceProfile` en hérite.
- **Les phrases d'allure d'avant ce lot** gardent une espace ordinaire avant leurs
  deux-points. Les reprendre toutes est un lot de typographie, pas celui-ci.
- **La FC du tracé** est cadrée sur son min–max, comme l'était la puissance. Moins grave :
  aucune phrase n'y affirme une FC constante.

### P2 à P6 — le quotidien, le matin, la charge, le coach, la montre (19 septembre 2026)

Livrés dans l'ordre du §11. `make check` : 1 988 tests backend (+68 depuis P1), 678 d'écran
(+19). Ce qui a bougé en chemin, phase par phase :

| | Ce qui s'écarte du plan, et pourquoi |
|---|---|
| **P2** | L'effort perçu s'écrit par une route à part, `PUT /runs/{id}/rpe` sous `If-Match` : repasser par le formulaire entier pour deux appuis aurait renvoyé tous les champs. La correction d'une course le **préserve**, comme `fit_path`. |
| **P2** | La météo n'a jamais été demandée au vrai Open-Meteo : doublure dans la batterie **et** à l'écran. La forme lue est celle de sa documentation publique, à vérifier au premier appel réel. |
| **P3** | « Revient à l'ouverture suivante » veut dire : au retour de l'application au premier plan (`visibilitychange`), pas au rendu suivant. Et une porte manuelle, « Parcours du matin » sur `/corps`, ouvre le parcours à toute heure. |
| **P4** | Le contexte d'une sortie est **recalculé à la lecture**, non figé à l'import : un repas saisi le lendemain doit compter (`trends.py`). |
| **P5** | La proposition au planning n'est pas un fantôme **dans** le calendrier, mais une carte sous lui, à côté de la semaine type proposée — même geste d'acceptation, sans toucher à la grille. |
| **P5** | L'annonce de la veille, 20 h 30, suit le réglage des rappels de séance : qui les a coupés ne la reçoit pas. |
| **P5** | Le coach **ne se sert pas** de la récupération Garmin tant qu'elle n'est pas confirmée (`garmin.CONFIRMED`) : la règle des 48 h la remplace. |
| **P6** | L'encodeur de `tests/fit_files.py` est **monté** dans `app/core/fit_writer.py`, chaînes comprises ; la batterie l'importe de là. Un seul encodeur de `.fit` dans le dépôt. |

#### Ce que le passage à l'écran a trouvé

L'API réelle, sur un stockage en mémoire chargé d'une **copie** des vrais fichiers — lus en
lecture seule, rien écrit sur Nextcloud —, avec un **modèle et une météo simulés**, push et
lecture du jour coupés. Parcourue au toucher (`Input.dispatchTouchEvent`) : réanalyse,
page de la sortie, effort perçu, proposition, acceptation, parcours du matin de bout en
bout ; puis les trois pages à 402 et 360 px dans les deux thèmes, et `audit-surfaces.mjs`.

| Trouvé | Corrigé en |
|---|---|
| **Ta sortie du 19/09 était déjà dans `runs.csv`**, importée avant ce lot — avec ses efforts, sans aucune mesure de montre. Le bouton « Réanalyser » ne comptait que les efforts : il ne serait **jamais** apparu | une sortie sans mesures rangées compte comme « à réanalyser » ; le texte du bouton dit ce qu'il refait |
| **Le coach attendait pour toujours** : « la dernière sortie n'a pas de proposition » valait « en préparation », et une sortie d'avant le coach n'en aura jamais | un registre des préparations en cours, rempli par la route d'import avant sa réponse |
| **Le parcours du matin n'avançait pas** après « Enregistrer » : la relecture rendait la copie en cache, qui disait encore « reprendre à la nuit ». La batterie ne pouvait pas le voir — elle remplace les options du client de requêtes, et le délai de 30 s avec | relu sur le serveur |
| Les dix pastilles d'effort perçu faisaient **39 px** de large, et la bande cachait 9 et 10 hors de l'écran | deux rangées de cinq |
| La ligne météo débordait de l'écran et **écrasait** « Météo au départ » — effet de bord du correctif de la carte « Foulée » | repliée sous son libellé |
| L'explication du modèle affichait `**dure**`, astérisques comprises | rendue par `Markdown`, comme la lecture du jour |
| Onze lignes « 0 sortie comparable » : un mur avant le premier constat | repliées sous « 11 facteurs en attente » |
| La carte du coach en tête du planning repoussait le premier chiffre à **822 px** | sous le calendrier : 211 px |
| « 1233 kcal », « 35:00 » | « 1 233 kcal », « 35 min » |

Un défaut de plus, trouvé **par un test** et non à l'œil : sur la page d'une autre sortie, la
carte du coach posait son intertitre et un squelette pendant le chargement, puis
disparaissait. La page sautait. Elle n'occupe plus aucune place tant qu'elle ne sait pas.

#### Laissé, et pourquoi

- **Aucun appel réel** à Open-Meteo ni à OpenRouter n'a été fait de ce lot. Le premier
  import en production sera le premier appel : c'est lui qui dira si la réponse
  d'Open-Meteo a la forme lue, et si le modèle gratuit du moment tient le contrat JSON.
- **Les champs Garmin non documentés restent masqués** — `garmin.CONFIRMED` est vide
  tant que leurs valeurs n'ont pas été relues sur Garmin Connect (§11).
- **Les cases du calendrier font 39 px à 360 px**, antérieur à ce lot : sept colonnes sur
  un petit Android.
- **Le planning écrit « Chargement du planning… »** au lieu d'un `Skeleton`, antérieur aussi.
- **Les glucides** : le lot suivant (**C12**). La corrélation nutrition n'a que les
  calories et les protéines.
- **Toujours aucun écran touché sur un vrai téléphone**, ni la montre qui reçoit le fichier
  d'entraînement : l'aller-retour `fitdecode` prouve le format, pas la façon dont une Epix
  l'affiche.


### Jamais deux jours de course d'affilée (20 septembre 2026)

Demandé par l'utilisateur, et c'est une règle **plus forte** que l'écart de 48 h entre
séances dures : celle-ci ne bornait que les séances dures, et un footing pouvait tomber le
lendemain de n'importe quoi.

Elle agit à trois endroits, et il en fallait trois :

1. **Les jours proposés** (`frame.build`) : le lendemain d'une sortie sort de la liste, y
   compris quand c'est un créneau `course` du planning — le cadre le dit alors en toutes
   lettres, « ton créneau course tombe le lendemain d'une sortie ».
2. **Le refus d'un choix** (`frame.check`) : un modèle qui vise ce jour-là est repris.
3. **La lecture d'une proposition** (`CoachService.view`) : une sortie **non prévue** la
   veille transforme la séance du jour en jour sans course, sans rappeler le modèle — et
   un jour sans course ne s'accepte pas au planning, puisqu'il n'y a rien à y mettre.

Ce que la règle ne fait pas : **retirer** quoi que ce soit du planning. Une séance que
l'utilisateur y a posée lui-même le lendemain d'une sortie y reste ; le coach ne la propose
simplement pas. `plan.csv` dit ce qui est prévu, et le coach n'efface pas une décision.

#### Ce que l'écran a trouvé

L'état « jour sans course » n'avait jamais été vu : une proposition datée d'aujourd'hui,
posée dans le stockage de test, l'a fait apparaître sur une copie des vraies données.

| Trouvé | Corrigé en |
|---|---|
| La phrase « Tu as couru la veille… » s'affichait **deux fois** : en justification, puis en explication | l'explication dit ce que l'autre ne dit pas — « le repos entre deux sorties fait partie de l'entraînement » |
| « Repos · dimanche 20 septembre · **0 min** » | la durée ne s'écrit plus quand il n'y en a pas |

Au passage, le parcours du matin s'est ouvert **de lui-même** par-dessus le planning : il
était 9 h côté serveur, et c'est exactement ce que **M2** décrit.

`make check` : 1 991 tests backend, 679 d'écran.
