# Importer une sortie depuis un fichier `.fit`

Une course s'ajoute aujourd'hui de deux façons : au clavier, ou depuis une capture d'écran
qu'un modèle relit. Les deux demandent de recopier ce que la montre savait déjà. Ce lot en
ouvre une troisième — **le fichier que la montre produit**, lu tel quel.

Le gain n'est pas la vitesse de saisie. C'est que le fichier porte ce qu'aucune capture
n'affiche : mille sept cent soixante-dix-huit points horodatés, position comprise. Les
paliers cessent d'être recopiés d'un écran pour être **mesurés**, et le parcours devient
affichable.

---

## 1. Ce que le fichier d'exemple contient

`Morning.fit`, export Strava du 11 septembre 2026. Décodé avant d'écrire une ligne — le
plan qui suit ne repose sur aucune supposition de format.

| | |
|---|---|
| Fabricant | `strava` (265), produit 101 — un export, pas une montre |
| Sport | `running` |
| Départ | 2026-09-11 04:59:22 **UTC**, `local_timestamp` à 06:59:22 → décalage **+2 h** |
| Distance | 5 075,65 m |
| Temps | `total_timer_time` 1 789,0 s — identique à l'elapsed, la course n'a pas été mise en pause |
| Foulées | 2 447 |
| D+ / D− | 6 m / 11 m |
| Points | 1 778 horodatages, chacun avec distance, position, altitude, vitesse, précision GPS |
| Fréquence cardiaque | **absente** |
| Calories | **absentes** |

Trois choses n'étaient pas prévisibles, et chacune coûte une règle plus bas.

### Deux flux de `record` entrelacés

Strava n'écrit pas un `record` par instant mais **deux**, sous deux définitions
différentes : l'un porte `distance`, l'autre porte `position_lat`, `position_long`,
`enhanced_altitude`, `speed` et `gps_accuracy`. Tous deux portent le même `timestamp`.

3 582 messages pour 1 778 instants. Un lecteur qui prend le premier venu obtient soit un
tracé sans distance, soit une distance sans tracé — et rien ne le signale : les deux
lectures rendent un objet plausible. **On fusionne par horodatage.**

### Les laps ne veulent rien dire

Le fichier déclare `num_laps: 1` et contient **deux** messages `lap`, chacun annonçant
5 075,65 m — la course entière, deux fois. Les recopier donnerait deux paliers de 5 km
pour une course de 5 km.

C'est le cas qui justifie la garde décidée avec l'utilisateur : **les laps s'ils sont
cohérents, sinon le kilomètre**. Cohérent veut dire que leur somme retombe sur la distance
de la session, à 2 % près, et qu'il y en a au moins deux. Ici 10 151 m contre 5 076 :
rejetés, on découpe au kilomètre.

Une montre Garmin avec de vrais tours passera la garde et gardera ses tours — c'est ce qui
justifie de ne pas découper au kilomètre dans tous les cas.

### Le dénivelé brut est du bruit

Sommer les montées entre points consécutifs donne **+89,6 m**. La session en déclare **6**.
L'altitude GPS oscille d'un mètre à chaque seconde sur un parcours plat, et 1 778 oscillations
font une montagne.

Conséquence en deux temps :

- Le D+ de la course vient de `session.total_ascent`, **jamais** du tracé.
- Les paliers découpés au kilomètre n'ont **pas de dénivelé du tout**. Une cellule vide est
  une valeur légitime (`STO-04`) ; +17 m sur un kilomètre plat est une valeur inventée, ce
  que le §2 de `CLAUDE.md` interdit à l'écran comme au fichier.

Les paliers issus de vrais laps, eux, portent le `total_ascent` que la montre a lissé.

---

## 2. Les cinq décisions

Prises avec l'utilisateur avant d'écrire.

| | Décision | Ce qu'elle coûte |
|---|---|---|
| **F1** | Le `.fit` est **rangé sur Nextcloud et re-téléchargeable** | ~130 Ko par sortie, une route de service, et une suppression de course qui doit aussi effacer le fichier |
| **F2** | Les paliers viennent des **laps s'ils sont cohérents, du kilomètre sinon** | une garde de cohérence, et deux chemins de calcul à tester |
| **F3** | Le tracé GPS est **dessiné en SVG**, sans carte ni tuile | on voit la forme du parcours, pas les rues ; aucune coordonnée ne part chez un tiers |
| **F4** | Décodeur : **`fitdecode`**, et non du code maison | une dépendance de plus à déployer ; en échange, le profil FIT complet et tous les fabricants |
| **F5** | Le fichier choisi **écrit directement** la course, corrigeable ensuite | rompt avec `IMP-01` — voir ci-dessous |

### Pourquoi **F5** ne casse pas `IMP-01`

`IMP-01` dit « rien n'est écrit sans validation ». L'invariant protégeait d'un **modèle qui
devine** : une capture relue par un LLM peut rendre 8,14 km là où l'écran affichait 3,14, et
seul un humain devant la capture peut le voir.

Un `.fit` ne devine rien. `total_distance: 5075.65` est une mesure, pas une lecture. Il n'y
a pas de brouillon à relire parce qu'il n'y a pas de doute à lever, et l'étape de validation
n'aurait montré que ce que le fichier dit déjà.

Reste le vrai risque de l'écriture directe, et le projet **n'a aucune annulation** : importer
deux fois le même fichier. Un garde-fou, et un seul :

> Une course est refusée si l'historique en contient déjà une **à la même date, à la même
> heure de départ, et à moins de 10 mètres** de la même distance.

C'est l'identité du fichier, pas une ressemblance. Deux sorties réellement différentes du
même jour passent ; le même fichier glissé deux fois est refusé avec son message.

---

## 3. Ce qui est lu, et ce qui en est fait

Le décodage vit dans `domains/activity/fit.py`, **sans dépôt ni écriture** — il reçoit des
octets, il rend une structure. C'est la moitié `analyze` de l'import Apple, sans le modèle.

| Champ de `RunRow` | Source dans le `.fit` | Si absent |
|---|---|---|
| `date` | `session.start_time` **ramené en heure locale** par l'écart `activity.local_timestamp − activity.timestamp` | refus : une course sans date n'est pas une course |
| `duration_min` | `session.total_timer_time`, sinon `total_elapsed_time` | refus |
| `distance_km` | `session.total_distance`, sinon la distance du dernier point | refus |
| `pace_min_km` | — | **calculée par le serveur**, comme toute saisie (`ACT-02`) |
| `elevation_m` | `session.total_ascent` | vide |
| `cadence_spm` | `total_strides × 2 ÷ minutes`, sinon la moyenne des `record.cadence × 2` | vide |
| `avg_hr` | `session.avg_heart_rate`, sinon la moyenne des `record.heart_rate` | vide |
| `active_calories` | `session.total_calories` | vide |
| `start_time` / `end_time` | départ local, et départ + durée | vide |
| `split_length_km` | 1,0 au découpage kilométrique ; la longueur d'un lap sinon | vide |
| `source` | `fit` | — |
| `fit_path` | le chemin de rangement du fichier | vide sur toute course d'avant ce lot |

**La foulée est une multiplication, pas une invention.** `total_strides` compte des cycles
de deux pas : 2 447 foulées en 29,8 minutes font 164 pas par minute, ce qui est une cadence
de course crédible et une mesure du téléphone, pas une déduction depuis l'allure — laquelle
reste interdite (`models.py`, `RunRow.cadence_spm`).

**Le sport est vérifié.** Un `.fit` de vélo ou de natation est refusé en toutes lettres :
`/activite/courses` est la course, et écrire une sortie vélo dans `runs.csv` fausserait
tout ce qui s'en nourrit — bandes de distance, volume mensuel, records des rappels.

---

## 4. Le tracé

> **Dépassé en partie** par [`analyse-course.md`](analyse-course.md) : `/runs/{id}/track` a
> laissé place à `/runs/{id}/analysis`, et le tracé n'est plus simplifié par
> Ramer–Douglas–Peucker mais **rééchantillonné sur la grille de la courbe d'allure**, pour
> que les deux se répondent point pour point. La normalisation et ses raisons, ci-dessous,
> tiennent toujours.

### Ce qui sort du serveur

Des coordonnées **normalisées entre 0 et 1**, plus le rapport hauteur/largeur du cadre. Pas
de latitude, pas de longitude. Deux raisons, dans cet ordre :

1. C'est l'invariant du §2 — le serveur calcule, le client formate. Projeter des degrés en
   pixels est un calcul métier, et il tient compte du fait qu'un degré de longitude est plus
   court qu'un degré de latitude à 43° de latitude.
2. Une capture d'écran partagée ne porte alors aucune adresse.

Le fichier brut, lui, garde tout : c'est le fichier de l'utilisateur, et **F1** dit qu'il
doit pouvoir le récupérer entier.

### La simplification

1 778 points font un JSON de 70 Ko pour un dessin large de 340 pixels sur un iPhone. On
simplifie par Ramer–Douglas–Peucker jusqu'à environ 300 points — à cette échelle, la
tolérance retenue déplace un point de moins d'un pixel.

### D'où il vient à l'affichage

**Du fichier rangé, relu à la demande.** Pas d'un nouveau CSV.

Un `activity/run_track.csv` aurait ajouté trois cents lignes par sortie — vingt-cinq mille
au bout de cent courses, dans un dépôt qui relit ses fichiers en entier. Et il aurait dupliqué
une vérité que le `.fit` détient déjà : à la première divergence, on ne saurait pas lequel
croire.

Le coût est une lecture de 130 Ko sur Nextcloud à l'ouverture de la page Course. Il est payé
par une **route séparée** — la page s'affiche entière sans attendre le tracé, qui arrive après.

---

## 5. Les surfaces

### Backend

```
domains/activity/fit.py          décodage pur : octets → structure. Aucune I/O.
                                 + le rangement : forme du chemin, garde de confinement
domains/activity/models.py       RunRow.fit_path — colonne en fin d'en-tête (`STO-04`)
domains/activity/schemas.py      RunTrack, RunTrackPoint ; Run.fit_path
domains/activity/service.py      RunService.create_from_fit · track · read_fit · fit_path
                                 préservé par update, fichier effacé par delete
domains/activity/router.py       POST /runs/fit · GET /runs/{id}/track · GET /runs/{id}/fit
storage/paths.py                 RUN_FITS = "activity/fit"
```

`fit_path` se rattrape sur le même piège que `run_id` : `_to_row` le **reçoit**, il ne le
tire jamais. Une correction de course qui le régénérerait détacherait le fichier de sa
course sans que rien ne le signale.

### Frontend

```
components/ui/Track.tsx          le tracé SVG, deux thèmes, départ et arrivée marqués
features/activity/api.ts         importFit · runTrack · fitPath ; types
routes/activity/NewActivitySheet.tsx   un troisième chemin à l'étape 1 de la course
routes/activity/Run.tsx          la carte du tracé, et le lien de reprise du fichier
```

---

## 6. Ce que le passage à l'écran a trouvé

La batterie rendait douze écrans à zéro défaut mesurable, l'audit tactile zéro cible sous
44 px à 402, 390 et 360 px, et l'audit de surfaces rien du tout. Quatre défauts sont sortis
en regardant la page, dont deux en important le vrai fichier par l'interface.

| Trouvé | Corrigé en |
|---|---|
| Le bouton du fichier, en `quiet`, passait pour une légende — c'est la seule action de la carte | `ghost`, 48 px de haut |
| Rien ne distinguait le départ de l'arrivée : deux marques muettes sous un dessin | une phrase qui les nomme |
| … et la phrase a **créé** le défaut suivant : un rond-point du parcours, boucle serrée que le tracé dessine lui-même, passait alors pour le cercle de départ | départ agrandi de moitié, trait épaissi |
| Le toast et le refus du serveur écrivaient « 5.08 km », point décimal anglais au milieu d'une phrase française | `num()` côté écran, `fr()` côté serveur |

Les deux derniers ne se voyaient qu'en important **le vrai fichier par l'écran** : le test
de la feuille affichait le message que le test lui-même avait écrit, et celui du serveur ne
vérifiait que le mot « déjà enregistrée ». Les deux le vérifient maintenant.

### Ce qui n'est pas fait, et pourquoi

- **Aucun graphique d'altitude** — levé depuis, et seulement s'il y a du relief (`analyse-course.md`, **A10**). Le profil brut est le bruit mesuré au §1 ; il faudrait le
  lisser, et un lissage est une décision qu'on ne prend pas en passant.
- **Pas de zone de confidentialité** autour du départ. Strava en a une ; le tracé d'ici ne
  sort pas de l'appareil de l'utilisateur, et l'ajouter sans le dire changerait la longueur
  affichée du parcours.
- **Le `.fit` ne relit pas une course existante.** Il en crée une. Rattacher un fichier à une
  course déjà saisie demanderait de choisir laquelle des deux mesures gagne, champ par champ.
