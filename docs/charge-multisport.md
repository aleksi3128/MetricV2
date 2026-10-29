# La charge multisport — sRPE, forme et fatigue, et les sauts de volume

Lot **R2** de [`runfurther-dans-metric.md`](runfurther-dans-metric.md), plan du 19/10/2026.
Exigences ANA-04, MSP-01, MSP-02 ; critère d'acceptation CA-02.

Metric calcule une charge **de course** : des minutes par zone, pondérées de 1 à 5
(`activity/load.py`). Le coach du matin en tire son rapport aigu/chronique. La natation, les
séances Cadence, le vélo et la marche n'y entrent pas — une semaine de trois natations et
deux circuits passe pour une semaine de repos. Ce lot ajoute une **charge globale**, tous
sports, sur une seule échelle, et ce que le cahier en attend : forme, fatigue, fraîcheur,
monotonie, et les sauts de volume qui blessent un débutant.

Décisions prises **seul**, l'utilisateur ayant délégué la suite le 19/10 : chacune porte sa
raison et son coût, pour être relue et défaite au besoin.

---

## 1. Les décisions

| # | Question | Décision | Ce que ça coûte |
|---|---|---|---|
| D1 | L'échelle commune | **sRPE = effort perçu × minutes** (Foster), pour tous les sports | Une séance sans effort perçu n'a **pas** de charge globale ; elle est comptée et nommée, jamais estimée — *sauf, depuis le 28 octobre, une course avec FC : §7* |
| D2 | TRIMP ou hrTSS quand la FC existe | **Pas dans ce lot** | Deux échelles ne s'additionnent pas ; mêler TRIMP et sRPE donnerait une courbe qui change d'unité selon la montre portée — *d'où, au §7, une conversion **dans** l'unité sRPE, calibrée, et non une seconde échelle* |
| D3 | La charge de course existante | **Gardée** pour la course (zones, séances dures, coach) | Deux charges coexistent : la charge **de course** et la charge **globale**. Chacune dit son nom à l'écran |
| D4 | Forme, fatigue, fraîcheur | **Banister**, moyennes exponentielles : CTL τ = 42 j, ATL τ = 7 j, TSB = CTL − ATL de la veille | La CTL est « en construction » tant qu'il n'y a pas 42 jours d'historique — elle s'affiche, marquée comme telle |
| D5 | Rapport aigu/chronique global | **Moyennes exponentielles** (Williams 2017) : λ = 2/8 et 2/29 ; 28 jours d'historique au moins | Un signal parmi d'autres (Impellizzeri 2020) : il nourrit une phrase et le cadre du coach, jamais un verdict seul |
| D6 | Monotonie et contrainte | **Foster** : moyenne ÷ écart type des 7 derniers jours (zéros compris), contrainte = somme × monotonie ; signalée au-delà de 2 | — |
| D7 | Les sauts de volume (CA-02) | **Deux règles de course**, sur la distance : la sortie la plus longue contre la plus longue des 28 jours d'avant (au-delà de +30 %), et les 7 derniers jours contre chacune des 3 semaines d'avant (au-delà de ×1,3 la moyenne) | Seuils de Nielsen 2014 (+30 % sur deux semaines), cités de mémoire par le cahier : à vérifier, et des constantes nommées |
| D8 | Vélo et marche | **Un fichier `activity/others.csv`** : sport, durée, distance, FC, effort perçu ; import `.fit` et saisie | Pas de tracé, pas de tours, pas d'analyse : c'est la charge qui est demandée, pas une page Vélo |
| D9 | La natation | **Une colonne `rpe`** dans `swims.csv`, notée comme une course | — |
| D10 | Où ça s'affiche | **L'API dans ce lot, l'écran au lot R10** (DSH-03) | Rien de neuf à voir avant R10, sauf l'effort perçu des nages et des sorties vélo/marche |
| D11 | La prise sur le coach | **Deux règles de plus au cadre** : rapport global ≥ 1,5 → du facile ; saut de volume → pas de hausse | Le coach cesse de lire la course seule — c'est le principe 6 du cahier, « tout croiser » |

### Pourquoi ne pas estimer l'effort perçu manquant

Une séance sans note pourrait recevoir l'effort de ses zones, ou une moyenne. Ce serait une
valeur inventée dans une courbe qu'on lit comme une mesure — la règle que le dépôt tient
partout. La charge globale dit donc : « 3 séances sans effort perçu ne comptent pas », et la note
se donne là où la séance se lit — la fiche d'une nage, celle d'une sortie à vélo, la fin
d'un import.

L'historique antérieur à septembre n'a presque pas d'effort perçu : la CTL partira bas. C'est
vrai, et ça se dit.

*Revu le 28 octobre pour la course seule (M-02, point 4, §7) : l'utilisateur a décidé qu'une
course avec FC entre par sa charge FC convertie, dite « estimée depuis la FC ». Ce n'est pas
une moyenne ni un effort deviné : un facteur appris de ses propres courses qui ont les deux,
et rien sous cinq. Le reste de cette section vaut toujours pour la nage, le renfo, le vélo et
la marche.*

### Pourquoi les sauts de volume se jugent sur la distance

CA-02 parle en kilomètres — « +70 % sur la plus longue sortie, volume de la semaine
multiplié par 2 à 4 » — et Nielsen aussi. Une distance se mesure sans référence ni note ;
c'est la seule grandeur que tout l'historique porte.

---

## 2. Les données

| Fichier | Changement |
|---|---|
| `activity/swims.csv` | colonne `rpe`, en fin d'en-tête (`STO-04`) |
| `activity/others.csv` | **nouveau** : `other_id`, `date`, `start`, `sport` (`vélo` · `marche` · `randonnée`), `duration_min`, `distance_km`, `avg_hr`, `max_hr`, `elevation_m`, `calories`, `rpe`, `fit_path`, `source`, `note` |

Aucun fichier n'est écrit pour la charge elle-même : elle se **calcule** à chaque lecture,
depuis les séances. Une série enregistrée serait une seconde vérité, fausse dès la première
correction d'un effort perçu.

---

## 3. Les calculs — `training/`, modules purs

`training/banister.py` — des séances datées `(jour, sport, minutes, rpe)` en entrée :

- la charge du jour, par sport et au total ;
- CTL, ATL, TSB jour par jour sur 120 jours ;
- le rapport aigu/chronique exponentiel ;
- monotonie et contrainte sur 7 jours ;
- les minutes par sport et par semaine, sur 8 semaines.

`training/volume.py` — des sorties de course `(jour, km)` en entrée : les deux règles de D7,
chacune rendant un **constat chiffré** ou rien.

Chaque résultat porte sa phrase, écrite par le serveur, et le modèle qui la fonde.

---

## 4. Les surfaces

### Backend

- `GET /api/training` — la vue de la charge globale.
- `GET /api/training/alerts` — les constats du jour, chacun avec une clé stable : R3 en fera
  des notifications critiques sans les envoyer deux fois.
- `PUT /api/activity/swims/{id}/rpe` sous `If-Match`.
- `activity/others` : `GET`, `POST`, `POST /fit`, `PUT /{id}/rpe`, `DELETE /{id}`.
- `fit.py` : un `.fit` de vélo, de marche ou de randonnée lève `fit_is_other` — le pendant
  de `fit_is_swim` —, et l'écran le réaiguille.
- `coach/frame.py` : D11.

### Frontend

- L'import d'un `.fit` vélo ou marche passe par la même porte que la course ; il demande
  ensuite l'effort perçu, puis la douleur.
- L'effort perçu d'une natation, sur sa page.
- La liste des sorties vélo et marche, dans l'historique de `/activite`.

---

## 5. Ce que ce lot ne fait pas

- **TRIMP, hrTSS** (D2).
- **Les écrans de la charge** : R10.
- **Les notifications** des constats : R3.
- **Une page Vélo** : le vélo est compté, pas analysé.
- **Les séances Cadence passées sans effort perçu** ne sont pas redemandées : la saisie le
  demande déjà.

---

## 6. Journal

### R2 livré (19 octobre 2026)

Livré tel que planifié. Ce que la mise en œuvre a ajouté ou changé :

- **Le vélo et la marche entrent aussi dans l'historique et les minutes de `/activite`**
  (MSP-01), jamais dans ses kilomètres, qui restent ceux de la course.
- **Le parcours du matin ne redemande l'effort perçu que des courses**, comme avant : le
  plan disait le contraire, il a été corrigé. Étendre la question aux nages et aux sorties
  à vélo est une ligne de plus dans l'étape « Ta journée », laissée pour ne pas allonger un
  parcours que l'utilisateur n'a jamais vu sur téléphone.
- **Une seule échelle d'effort à l'écran** : `RateRun` est devenu `RateEffort`, que la
  course, la nage et le vélo emploient.
- **Le relevé de douleur suit toutes les séances importées** : `PainCheck` prend désormais
  l'identifiant stable de n'importe quelle séance, et `pain.csv.run_id` le porte.
- **CA-02 rejoué** sur un historique reconstitué — des semaines à 6, 8 et 12 km, la plus
  longue à 7,66 km, puis 13,1 km le 08/10 : « +71 % » et « ×2 à ×4 ».

#### Ce que le passage à l'écran a trouvé

Sur la vraie API branchée à un WebDAV en mémoire, à 402 et 360 px : la feuille d'une sortie
à vélo disait « VÉLO DU 18/10/2026 · 1:02:00 » quand celle d'une nage, juste à côté, dit
« NATATION DU 17/10 · 40 min ». Alignée sur la nage. Les mesures étaient propres.

#### Laissé, et pourquoi

- ~~**Saisir une sortie vélo ou marche à la main**~~ : fait le 27 octobre (M-16,
  `docs/pages/modifications.md`) — troisième choix de la feuille « Course », l'effort perçu
  dans la saisie, `rpe` accepté par `POST /others`.
- **TRIMP et hrTSS** (D2), **l'écran de la charge** (R10), **les alertes envoyées** (R3).


---

## 7. Une course sans effort perçu, estimée depuis sa FC — M-02, point 4

Plan du 29 octobre (session 10 c), sur la décision de l'utilisateur du 28 :
[`pages/modifications.md`](pages/modifications.md#m-02).

**Le constat.** Une course `.fit` avec FC et sans effort perçu n'entrait pas dans la charge
globale. Sur le banc, la page Courses montrait une charge de course (FC) 7 jours de 310 à
côté d'un accueil qui disait « Pas encore de charge globale ».

**La décision** (de l'utilisateur, non reposée ici) : une telle course entre par sa **charge
FC convertie**, dite « **estimée depuis la FC** » partout où elle compte, et **remplacée par
la vraie valeur** dès que l'effort perçu est noté.

### Ce que le plan a tranché

| # | Question | Décision | Pourquoi, et ce que ça coûte |
|---|---|---|---|
| E1 | La conversion | `sRPE estimée = facteur × charge FC`, le facteur étant la **médiane** des `sRPE ÷ charge FC` des courses de l'utilisateur qui ont **les deux** (`training/estimate.py`) | Une constante (« × 2, puisque 5 zones font 10 points d'effort ») serait une valeur décidée ici, qu'aucune mesure n'a vue ; le rapport dépend de la personne. Une médiane, pas un rapport des sommes : une sortie longue pèserait cinq footings, et un effort mal noté déplacerait une moyenne |
| E2 | Le seuil | **Cinq paires** (`estimate.MIN_PAIRS`) | Le plancher que le dépôt tient déjà pour dire quelque chose d'une série de sorties (`correlations.py`) ; une médiane de cinq résiste à deux valeurs aberrantes. **En dessous, pas d'estimation** : la course reste hors de la charge, et `/charge`, la page de la course et l'accueil (sans aucune séance notée) disent ce qu'il manque — « à 5 courses notées avec FC — 2 pour l'instant » |
| E3 | Quelle charge FC | `load.Session.hr_load` : la charge de `activity/load.py` **seulement si ses zones sont cardiaques** (`zone_kind = heart_rate`) | La décision vise une course avec FC. Une charge d'allure (une course saisie, ou un `.fit` sans cardio) reste hors de l'estimation, et le dit : « Pas dans la charge globale tant que son effort perçu n'est pas noté » |
| E4 | Le périmètre | **La course seule** | Un vélo ou une marche `.fit` porte une FC moyenne et maximale dans `others.csv`, mais **aucune zone** : il n'a pas de charge FC à convertir, et lui en fabriquer une depuis une moyenne serait une seconde règle. Laissé ouvert (§7 de `modifications.md`) |
| E5 | Remplacer | L'effort noté **remplace** : `Session.load` lit `rpe × minutes` dès que `rpe` existe, l'estimation est ignorée | Rien n'est écrit : l'estimation se calcule à chaque lecture, comme toute la charge (§2) |
| E6 | Le dire | Une **phrase du serveur**, jamais un vocabulaire visuel : la parenthèse de `form_text` (« Banister, dont 2 courses des 4 semaines estimées depuis la FC »), `estimated_text` sur `/charge`, `global_load_text` sur la page de la course, `estimated_note` dans la raison du coach et l'avertissement du planning | Une estimation calculée n'est **pas** une proposition (`CLAUDE.md` §2) : ni `AiBlock`, ni `proposed`. Le client recopie, ne calcule ni le facteur ni la part |
| E7 | Facile / modéré / dur, et `EASY_TARGET` | **Inchangés** | Une course avec FC s'y range déjà par ses zones, seconde par seconde (`intensity.py`, D5 de R10) : plus fin que toute sRPE |
| E8 | Les sauts de volume | **Inchangés** | Ils se jugent sur la distance (D7), que toute course porte |

### Ce qui change de sens

- **La forme, la fatigue et la fraîcheur bougent pour toutes les dates passées** où une
  course avec FC sans effort existait — et la courbe peut commencer plus tôt. Sur le banc
  (six courses notées, trois sans effort les trois derniers jours) : avant, forme 20,
  fatigue 34, fraîcheur −19 ; après, 34, 97, −79. C'est exactement l'écart que la décision
  voulait fermer : trois sorties de 40 minutes ne sont pas trois jours de repos.
- **Le facteur se recalcule à chaque lecture.** Chaque effort noté sur une course avec FC le
  déplace, et avec lui **toutes** les estimations passées. Voulu : figée, l'estimation
  garderait l'erreur du premier jour.
- **Le rapport aigu/chronique global et la monotonie** comptent les estimations. Le coach
  (`coach/frame.py`) **lit le rapport comme les autres** — il ferme le dur à 1,5 qu'il soit
  mesuré ou estimé — mais sa raison le dit (`estimated_note` ajouté à `global_ratio_text`).
  Même chose pour l'avertissement « Rapport de charge » du planning (`planning/guard.py`).
- **Le parcours du matin et le point du soir ne changent pas** : ils demandent l'effort des
  courses qui n'en ont pas, estimées ou non — c'est ce qui remplace l'estimation. Ils ne
  citent pas la charge globale.
- **Le condensé de l'assistant et du coach** (`assistant/context.py`) ne cite pas la charge
  globale : il n'y avait rien à marquer. Il garde « effort perçu non noté ».
- `unrated` change de sens : il compte les séances **hors** de la charge, sans effort ni
  estimation ; une course estimée passe à `estimated`. « Toutes les séances ont un effort
  perçu » se tait dès qu'une estimation existe.

### Livré le 29 octobre

`training/estimate.py` (pur), `banister.Session.estimated` et `hr_load`, `load.Session.zone_kind`
et `hr_load`, `TrainingService` qui lit les courses par `RunTrendsService` (la même charge FC
que la page Courses) et sert `estimated`, `estimated_text` ; `RunConditions.global_load*` ;
`/charge` et la carte « Effort perçu » de la page d'une course recopient la phrase.

**Vu sur le banc**, à 402 px, dans les deux thèmes : la page d'une course sans effort disait
« Dans la charge globale : 183, estimée depuis la FC — ta charge FC 122 × 1,5, la médiane de
tes 6 courses notées avec FC. Noter ton effort perçu la remplace. » ; un appui tactile sur 6
l'a changée en « Dans la charge globale : 244, ton effort perçu 6 × 40,6 min. », et `/charge`
est passé de trois courses estimées à deux, sur sept paires. Sous le seuil (deux paires), la
course reste hors de la charge et la page le dit.

**Laissé.** Le vélo et la marche avec FC (E4) ; « 21 jours d'historique **noté** » compte
désormais les jours estimés aussi, la phrase n'a pas été reprise. « 3 séances … (3 course) »,
un pluriel antérieur vu en route, est corrigé avec le lot (« 2 natations, 1 vélo »).
