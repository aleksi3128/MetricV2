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
| D1 | L'échelle commune | **sRPE = effort perçu × minutes** (Foster), pour tous les sports | Une séance sans effort perçu n'a **pas** de charge globale ; elle est comptée et nommée, jamais estimée |
| D2 | TRIMP ou hrTSS quand la FC existe | **Pas dans ce lot** | Deux échelles ne s'additionnent pas ; mêler TRIMP et sRPE donnerait une courbe qui change d'unité selon la montre portée |
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

