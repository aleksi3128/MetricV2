# La synchro Garmin, la santé de la nuit, et les doublons

> **La synchro Garmin a été retirée le 28 octobre 2026.** L'utilisateur avait décidé, le
> 27, qu'il n'y en aurait **aucune, même en production** (fiche M-18 écartée), puis, le 28,
> d'en retirer le code plutôt que de le garder dormant. Garmin n'ouvre pas son API, la voie
> non officielle demandait ses identifiants sur le serveur et pouvait faire bloquer le
> compte, et R0 ne devait jamais avoir lieu (§5, « Pas d'accès au compte ») : un code qui
> ne tournera jamais ne garde de sa valeur que ce qu'il coûte à relire.
>
> **Ce qui est parti** : `domains/sync/` (connecteur, passe, `GET`/`POST /api/sync`), la
> passe de l'ordonnanceur toutes les 30 minutes et sa notification « Séance reçue » (D3,
> D7), `make sync`, les lignes Garmin de `make status` et `make doctor`, les réglages
> `GARMIN_EMAIL`, `GARMIN_PASSWORD` et `GARMIN_TOKEN_DIR`, et l'écriture de
> `body/health.csv`. **Une sortie n'entre plus dans Metric que par son `.fit`, déposé à la
> main** — ce que CA-08 garantissait déjà.
>
> **Ce qui vaut encore** :
>
> - **Les doublons entre sources (D6, CA-03)**, `activity/dedup.py` : deux `.fit` de la
>   même sortie, ou un `.fit` et une capture Apple, se rencontrent toujours. Le rang
>   `garmin` reste classé avec `fit`, pour une ligne déjà stockée qui le porterait.
> - **La santé de la nuit déjà reçue (D5)** : `GET /api/body/health` relit
>   `body/health.csv` tel qu'il est, l'accueil n'affiche la nuit que si elle existe. Le
>   fichier n'a **plus d'écrivain** — et, la synchro n'ayant jamais été configurée, il est
>   probablement absent : rien ne l'a jamais écrit en production. **Depuis le 29 octobre,
>   la durée du sommeil se saisit le matin**, dans `body/morning.csv`, et la même route
>   réunit les deux (§6).
> - **Les données de la synchro**, `sync/imported.csv` et `sync/state.csv`, si elles
>   existent, restent au stockage : rien ne les lit plus, rien ne les efface.
>
> Les §1 à §5 sont l'historique du lot R7, laissé tel quel ; le §6 est le plan du sommeil
> saisi le matin.

Lot **R7** de [`runfurther-dans-metric.md`](runfurther-dans-metric.md), plan du 20/10/2026.
Exigences ANA-01, ANA-02, NOT-04 ; critères d'acceptation CA-03 et CA-08.

Aujourd'hui, une sortie entre dans Metric parce qu'on dépose son `.fit`. Le cahier veut
qu'elle arrive seule, avec la nuit — sommeil, VFC, FC de repos, stress, Body Battery — et
qu'une même sortie reçue deux fois ne compte qu'une fois.

Garmin n'ouvre plus son API officielle. La voie est la bibliothèque non officielle
`garminconnect`, avec les identifiants de l'utilisateur : elle peut casser du jour au
lendemain. **Le lot R0 — prouver qu'elle marche — attend ces identifiants** ; ce lot pose
tout le reste, éprouvé contre une doublure, et laisse l'import `.fit` intact (CA-08).

Décisions prises seul (délégation du 19/10).

---

## 1. Les décisions

| # | Question | Décision | Ce que ça coûte |
|---|---|---|---|
| D1 | Le connecteur | **`garminconnect`**, importé seulement s'il est installé, derrière une interface à trois méthodes : les activités depuis une date, le `.fit` d'origine d'une activité, la santé d'un jour | Rien n'a été appelé pour de vrai : R0 |
| D2 | Les identifiants | **Dans l'`.env` du serveur**, comme les autres secrets (`GARMIN_EMAIL`, `GARMIN_PASSWORD`) ; les jetons de session dans un dossier du serveur | Le chiffrement applicatif des identifiants vient avec le dossier médical (R9) |
| D3 | Le rythme | **Toutes les 30 minutes**, et à la demande | Une sortie apparaît au plus une demi-heure après la synchro de la montre |
| D4 | Ce qui est importé | **Le `.fit` d'origine**, rangé comme un dépôt à la main, aiguillé par sport : course, natation, vélo/marche/randonnée ; le reste est ignoré | Une activité déjà importée à la main n'est pas doublée : le refus du « même fichier » s'applique |
| D5 | La santé de la nuit | **FC de repos et VFC** dans `body/morning.csv` (s'il n'y a rien ce jour-là — une saisie l'emporte) ; **sommeil, stress, Body Battery** dans `body/health.csv` | — |
| D6 | Les doublons (CA-03) | **Deux courses du même jour dont les heures se chevauchent sont la même sortie.** On garde la meilleure source : montre (`fit`, `garmin`) > Apple > saisie ; les autres sont marquées `duplicate_of` et sortent de tous les comptes | Une course sans heure ne se compare à rien : deux saisies du même jour restent deux sorties |
| D7 | Le débrief à l'arrivée (NOT-04) | **Une notification par sortie synchronisée**, qui ouvre sa page — l'effort perçu et la douleur s'y demandent | — |
| D8 | La panne (CA-08) | **Le connecteur en panne ne bloque rien** : l'état le dit, l'import `.fit` reste la voie garantie | — |

### Pourquoi un doublon se marque au lieu de se supprimer

Le projet n'a aucune annulation, et la sortie écartée peut porter ce que l'autre n'a pas — la
note tapée à la main, l'effort perçu. Elle reste dans le fichier, marquée, et revient d'elle-
même si la sortie gardée est supprimée.

---

## 2. Les données

| Fichier | Contenu |
|---|---|
| `activity/runs.csv` | colonne `duplicate_of` : le `run_id` de la sortie gardée |
| `body/health.csv` | **nouveau**, famille *mesure* : `date`, `sleep_min`, `sleep_score`, `stress_avg`, `body_battery_high`, `body_battery_low`, `source` |
| `sync/imported.csv` | **nouveau** : `garmin_id`, `kind`, `local_id`, `date` — ce qui a déjà été importé |
| `sync/state.csv` | **nouveau** : la dernière synchro réussie, la dernière erreur |

---

## 3. Les surfaces

- `activity/dedup.py`, pur : des courses d'un jour, la gardée et les écartées.
- `sync/connector.py` : l'interface, l'implémentation `garminconnect`, et l'erreur qui dit
  ce qui manque (bibliothèque, identifiants, refus de Garmin).
- `sync/service.py` : la passe — activités, puis santé — et son état.
- `GET /api/sync`, `POST /api/sync` ; `GET /api/body/health`.
- L'ordonnanceur : une passe toutes les 30 minutes, une notification par sortie reçue.
- Réglages : une carte « Garmin » — l'état, la dernière synchro, « Synchroniser ».

---

## 4. Ce que ce lot ne fait pas

- **Appeler Garmin pour de vrai** : R0, sur accord et avec les identifiants.
- **Strava** : écarté par le cahier lui-même.
- **Envoyer les séances sur la montre par Garmin Connect** (PLN-06, V2) : le `.fit`
  d'entraînement existe déjà, à copier par câble.

---

## 5. Journal

### R7 livré (20 octobre 2026)

Livré tel que planifié, **contre une doublure** : aucun appel à Garmin n'a eu lieu. CA-03
rejoué de bout en bout — deux morceaux Apple puis la sortie de la montre sur les mêmes
heures : la montre reste seule dans l'historique, la semaine et la charge ; supprimée, les
deux morceaux reviennent. CA-08 rejoué : un connecteur qui refuse la connexion laisse son
erreur dans l'état, l'écran la dit, et l'import d'un `.fit` passe.

Deux conséquences du dédoublonnage, à connaître :

- **Une sortie marquée en double disparaît de l'historique** : elle n'est plus comptée, et
  elle ne se voit plus. Elle reste au fichier et revient si la gardée est supprimée.
- **La sortie gardée change de jeton** quand elle écarte une autre : `create` la relit
  avant de la rendre, sans quoi l'effort perçu demandé juste après l'import partait en
  conflit. Un test le tient.

#### Ce que le passage à l'écran — et les tests — ont trouvé

- **« Body Battery » s'écrivait « body battery »** : `capitalize()` met en minuscules tout
  ce qui suit la première lettre. Corrigé.
- La date de dernière synchro était mise en forme par l'écran avec `new Date()` — ce que
  l'invariant du dépôt interdit. Le serveur la rédige.
- La carte redisait sous le message du serveur que l'import `.fit` reste possible : le
  rappel ne s'affiche plus qu'en cas de panne.

#### Laissé, et pourquoi

- **R0 n'a pas eu lieu** : sans identifiants ni accord, `garminconnect` n'est pas installé
  et n'a jamais été appelé. Les noms de ses méthodes et de ses champs viennent de sa
  documentation ; le premier appel réel les éprouvera.
- **Les identifiants sont en clair dans l'`.env`**, comme les autres secrets du serveur ;
  le chiffrement applicatif vient avec R9.
- **Aucun écran ne montre encore la nuit** (sommeil, stress, Body Battery) : l'API la sert,
  l'accueil de R10 l'affichera.


### Pas d'accès au compte (20 octobre 2026)

**R0 est tranché : l'utilisateur ne donne pas accès à son compte Garmin.** L'import du
`.fit` reste la seule voie, comme CA-08 le garantissait. La carte « Garmin » quitte les
réglages, et l'accueil ne promet plus une nuit « qui arrive avec la synchro » : elle ne
s'affiche que si elle existe. Le connecteur, la passe de l'ordonnanceur et `make sync`
restent dans le dépôt, **inertes** sans identifiants — l'ordonnanceur se tait déjà quand ils
manquent. Le dédoublonnage (D6) sert toujours : deux `.fit` de la même sortie, ou un `.fit`
et une capture Apple.

### Le code retiré (28 octobre 2026)

Le 27 octobre, M-18 (l'état de la synchro dans les réglages) est écartée : aucune synchro,
même en production. Le 28, le code dormant part avec elle — voir l'encadré en tête. Les
tests de la synchro (la passe par sport, le fichier déjà déposé, la panne CA-08, le débrief
annoncé) partent aussi ; ceux du dédoublonnage restent, dans `tests/test_dedup.py`, et la
lecture de la nuit est éprouvée sur un `body/health.csv` semé (`tests/test_body.py`) — elle
ne l'était qu'à travers la synchro.

---

## 6. Le sommeil saisi le matin (plan du 29 octobre 2026)

**Décision de l'utilisateur, le 29 octobre** : le matin, il saisit **la VFC, la FC de repos
et la durée du sommeil**, toutes trois lues sur la montre. Ni score de sommeil, ni ressenti,
ni stress, ni Body Battery. La durée est une **mesure**, pas un ressenti.

Ce plan est écrit ici et non dans un document neuf : il prend la suite directe de **D5** (la
santé de la nuit), et la ligne du §1 de `CLAUDE.md` qui mène à ce fichier nomme déjà « la
santé de la nuit ». Une page de plus pour une section aurait demandé une ligne d'index de
plus pour le même sujet.

### 6.1 Ce qu'on a trouvé en lisant

- **Un seul lecteur du sommeil.** `sleep_min` n'est lu que par `HealthService.view`
  (`GET /api/body/health`), que seule la ligne « nuit » de la carte Forme de l'accueil
  affiche. **Ni la corrélation, ni les tendances, ni le coach ne lisent le sommeil** :
  `activity/correlations.py` et `trends.py` ne prennent du matin que la VFC et l'écart de
  FC ; le coach, le replanificateur et l'assistant ne lisent que la *forme*
  (`readiness`), qui ne repose que sur la FC de repos et la VFC.
- **`body/health.csv` est probablement absent en production** (encadré en tête) : la
  synchro n'a jamais été configurée.
- **Le matin a deux écrivains à l'écran** : l'étape « Ta nuit » du parcours (`POST` puis,
  le jour même, `PATCH`) et la correction de la carte « Le matin » de `/corps` (M-09,
  `PATCH` sous `If-Match`). Le `PATCH` **remplace la ligne entière**.

### 6.2 Les décisions

| # | Question | Décision | Ce que ça coûte |
|---|---|---|---|
| S1 | Où vit la durée | **Une colonne `sleep_min` de `body/morning.csv`**, à côté de `resting_hr` et `hrv_ms`. `body/health.csv` reste ce qu'il est : une archive de la montre, lue, jamais écrite | L'historique du sommeil a deux fichiers : l'archive (avant le 28 octobre), le matin (depuis). Une règle de lecture, en un seul endroit (S5) |
| S2 | Le geste | **Un champ de plus dans l'étape « Ta nuit »**, sous la FC et la VFC : deux cases, heures et minutes, 16 px, vides. Un enregistrement écrit les trois | L'étape s'allonge d'une rangée ; le parcours ne gagne pas d'écran |
| S3 | Le relevé de la veille | **Rappelé en une ligne au-dessus des cases, jamais prérempli** — « Ton dernier matin, le mardi 28 octobre : FC 52 bpm · VFC 61 ms · sommeil 7 h 12. » —, comme la dernière pesée. Ce n'est pas une proposition : ni `AiBlock`, ni `proposed`. Une ligne et non trois : la même date redite sous chaque case n'apprendrait rien la deuxième fois | Le serveur sert `MorningView.previous`, le dernier matin avant aujourd'hui ; ce qui lui manquait n'est pas nommé |
| S4 | La correction | **Le formulaire de la carte « Le matin » de `/corps`** gagne les deux cases ; même `PATCH /api/body/morning/{id}`, même `If-Match`. Le parcours corrige le matin du jour comme aujourd'hui | Le `PATCH` remplaçant la ligne, **les deux écrivains envoient la durée** — sans quoi corriger une FC effacerait le sommeil. Le type du client la rend obligatoire |
| S5 | La lecture de la nuit | `GET /api/body/health` **réunit** l'archive et les matins : un jour a une nuit si l'un des deux porte un sommeil, ou l'archive un stress ou une Body Battery. **La durée saisie l'emporte** sur celle de l'archive, et le score de la montre n'est alors pas repris — il notait une autre durée | Les deux sources ne se rencontrent qu'un jour corrigé après coup : avant le 28 octobre l'une, depuis l'autre |
| S6 | Une ligne `garmin` de l'archive | **Jamais réécrite.** Corriger la durée d'un jour se fait sur son matin ; la ligne de la montre garde tous ses champs, puisque rien n'y écrit | Une durée de la montre ne se corrige pas en place — elle se recouvre |
| S7 | Le stress et la Body Battery | **Rien n'est dit quand ils manquent** : la phrase de la nuit ne nomme que ce qui existe (« 7 h 12 de sommeil. »). Ni zéro, ni tiret, ni promesse d'une source qui ne viendra pas | La carte ne dit pas pourquoi ils ont disparu ; l'archive les montre encore pour ses jours |
| S8 | Les lecteurs de la forme | **Le sommeil n'entre pas dans la forme**, ni donc dans le coach. Un matin qui ne porte **que** le sommeil ne compte pas parmi les dix matins d'une référence, et la forme du jour dit « Ni FC de repos ni VFC ce matin » au lieu de « Pas encore de mesure » | Faire peser le sommeil sur la séance est une décision de produit (le coach allège *par règle*) : pas prise ici |

### Pourquoi `morning.csv` et non `health.csv`

La recommandation de départ était `health.csv`, pour garder une seule vérité du sommeil
« puisque tous les lecteurs existants la lisent là ». La lecture du code dit autre chose :
il n'y a **qu'un** lecteur, et il est réécrit ici en dix lignes. Restent les raisons de
`morning.csv` :

1. **Un geste, une ligne, un jeton.** Les trois nombres se lisent sur la montre au même
   moment. Dans deux fichiers, l'enregistrement ferait deux écritures sans transaction :
   la FC passée et la durée refusée laisseraient un matin à moitié écrit, et sa reprise
   devrait savoir laquelle des deux a abouti. La correction porterait deux jetons
   `If-Match` pour une seule ligne à l'écran.
2. **La correction existe déjà.** La carte « Le matin » (M-09) corrige et supprime un
   matin ; elle gagne deux cases. Dans `health.csv`, il faudrait une seconde liste, une
   seconde route `PATCH`, et décider si une nuit de la montre se supprime.
3. **`health.csv` a été dessiné pour la montre** : cinq colonnes dont quatre (score,
   stress, Body Battery haute et basse) ne seront plus jamais remplies. Y écrire à la main
   ferait d'une archive figée un fichier vivant à moitié vide.
4. **La nature de la donnée.** `MorningRow` se définit comme « des mesures lues sur la
   montre, pas un ressenti » : c'est mot pour mot la durée telle que l'utilisateur l'a
   décidée.

Le prix — deux fichiers pour l'historique du sommeil — se paie **une fois, dans
`HealthService`**, et les deux sources ne se recouvrent que si l'on corrige après coup un
jour d'avant le 28 octobre.

### 6.3 Ce qui change

**Serveur**

- `MorningRow.sleep_min` (`int | None`). Une colonne absente d'un fichier ancien se lit
  vide.
- `MorningPayload` : `sleep_hours` (0–16) et `sleep_minutes` (0–59). **Le serveur compose
  la durée** : un client qui additionnerait des minutes serait un second analyseur de
  saisie. Heures sans minutes vaut « h 00 » ; une durée nulle ou au-delà de 16 h est
  refusée, en français. « Au moins une » mesure devient « la FC, la VFC ou le sommeil ».
- `MorningEntry` : `sleep_min`, et sa décomposition `sleep_hours` / `sleep_minutes`, pour
  que le formulaire se rouvre sans calcul.
- `MorningView.previous` : le dernier matin avant aujourd'hui (S3).
- L'historique de la forme ne prend que les matins qui portent une FC ou une VFC (S8).
- `HealthService.view` réunit l'archive et les matins (S5) ; `HealthDay.sleep_source` dit
  d'où vient la durée.
- Aucune route nouvelle, aucun code d'erreur nouveau : `validation_error` et `conflict`
  servent.

**Client**

- L'étape « Ta nuit » : la phrase dit les trois mesures, deux pas-à-pas pour la durée
  (heures, minutes par cinq), le rappel du dernier matin au-dessus ; l'invalidation reste `keys.body.all()`, `keys.activity.all()` et
  `CROSS_CUTTING` — c'est elle qui rafraîchit la nuit de l'accueil (`keys.aggregates`).
- La carte « Le matin » de `/corps` : « sommeil 7 h 12 » dans la liste, les deux cases dans
  la correction.
- La ligne « nuit » de l'accueil ne change pas de forme ; elle s'allume dès le premier
  matin qui porte un sommeil.

### 6.4 Ce que ce plan ne fait pas

- **Une courbe du sommeil sur `/corps`** : la carte « Le matin » trace la FC et la VFC
  contre leur référence ; une troisième série demanderait de dire ce qu'est la référence
  d'un sommeil. Les durées se relisent dans la liste.
- **Le sommeil comme facteur de corrélation** (« ce qui va avec une bonne sortie ») : un
  facteur de plus, cinq sorties par groupe avant tout constat — il n'aura de données que
  dans plusieurs semaines. À ajouter quand elles existeront.
- **Le sommeil dans la carte « Conditions » d'une sortie**, ni dans le condensé de
  l'assistant.
- **Le sommeil dans la forme et le coach** (S8).

### 6.5 Livré (29 octobre 2026)

Livré tel que planifié (`c6c10b4`), sans route ni code d'erreur nouveaux.

**Vu sur le banc** — la vraie API sur `fake_webdav`, toutes les doublures branchées, un
proxy mort, et l'horloge du seul routeur du matin posée à 8 h : l'étape « Ta nuit » à
402 px, en sombre et en clair, sans matin la veille (aucun rappel, quatre cases vides)
puis avec (« Ton dernier matin, le mercredi 28 octobre : FC 52 bpm · VFC 61 ms · sommeil
6 h 48. », cases vides) ; l'enregistrement, qui mène à l'étape suivante ; la ligne de la
nuit de l'accueil (« Relevé du 29/10 — 7 h 12 de sommeil. ») ; la liste et la correction
de `/corps`, et le refus d'un « 0 min » dit par sa phrase. `audit-surfaces.mjs` : le
parcours du matin à 0 défaut à 402, 390 et 360 px.

**Ce que l'écran a trouvé** : à 402 px, la liste de `/corps` coupait « sommeil » en fin de
ligne et « 7 h 12 » sous elle. Les mesures sont désormais insécables ; la ligne se coupe
entre elles.

**Laissé** — le §6.4, et :

- Les deux pas-à-pas du sommeil font 50 px de haut, ceux de la FC et de la VFC 56 : le
  pas-à-pas se mesure à sa colonne et tombe à `--tap` dans une demi-largeur. Au-dessus du
  plancher, mais la rangée se voit plus basse.
- Chaque matin change de jeton au déploiement : l'empreinte d'une ligne porte toutes les
  colonnes du modèle, `sleep_min` vide comprise. Un écran lu avant et corrigé après reçoit
  un conflit et relit — c'est la garde, pas une panne.
