# L'accueil, la charge à l'écran, et le respect de la séance prévue

Lot **R10** de [`runfurther-dans-metric.md`](runfurther-dans-metric.md), plan du 20/10/2026.
Exigences DSH-02 à DSH-05, ANA-03 ; critère d'acceptation CA-04.

Trois lots ont rangé des chiffres que personne ne voit encore. La charge tous sports de R2
(forme, fatigue, fraîcheur, rapport aigu/chronique, monotonie) n'a pas d'écran. Les alertes
ouvertes de R3 ne s'affichent nulle part. La nuit de R7 (sommeil, stress, Body Battery) est
servie, et jamais montrée. Ce lot les met à l'écran, et ajoute les deux lectures que le
cahier demande en plus : la **part du facile sur tous les sports** et la **frise des
douleurs** sur la courbe de charge. Il chiffre aussi ce que valait une sortie par rapport à
la séance prévue : CA-04, « 5 km sur 5 dans la plage ».

Décisions prises seul (délégation du 19/10).

---

## 1. Les décisions

| # | Question | Décision | Ce que ça coûte |
|---|---|---|---|
| D1 | Où vit la charge | **Un écran `/charge`**, dans « Plus » et depuis l'accueil | La page Course garde sa charge **de course** ; chacune dit son nom (D3 de R2) |
| D2 | L'accueil (DSH-02) | **Une carte « Forme »** sous la lecture du jour : les alertes ouvertes d'abord, puis la fraîcheur et le rapport de charge en phrases, puis la nuit. La séance du jour y est déjà | Trois appels de plus, chacun avec ses quatre états : la carte peint sans attendre l'agrégat, et l'agrégat sans l'attendre |
| D3 | La courbe (DSH-03) | **Forme (CTL) en trait plein, fatigue (ATL) superposée** — même unité, même axe ; la fraîcheur (TSB) **en phrase et en chiffre**, pas en troisième trait | Trois courbes sur 360 px ne se lisent plus ; la fraîcheur est la différence des deux qu'on voit |
| D4 | La frise des douleurs (DSH-05) | **La bande sous la courbe** : la douleur la plus forte notée chaque jour, sur 10, qui passe en alerte à partir de 7 (le seuil d'arrêt de R1) | Un jour sans relevé dessine une barre nulle, comme un « 0/10 » : la légende dit « douleur notée », et c'est le seul écart |
| D5 | Le facile sur tous les sports (DSH-04) | **28 jours, en minutes.** Une course avec zones de FC compte son temps par zone ; sans zones, sa zone d'allure ; une autre séance, son **effort perçu** : 1–4 facile, 5–6 modéré, 7–10 dur (le découpage en trois zones de la sRPE). Cible : **80 % de facile** (Seiler) | Une séance sans zones ni effort perçu n'est **pas** devinée : ses minutes sont nommées, hors compte |
| D6 | Le volume par sport | **Huit semaines**, une barre par semaine, sa longueur et sa phrase (« 3 h 10 · course 2 h, vélo 1 h 10 ») **rédigées par le serveur** | — |
| D7 | Le respect de la séance (CA-04, ANA-03) | **Contre la séance du coach acceptée pour ce jour-là**, ses étapes rebâties depuis les zones. Chaque kilomètre plein est rangé dans l'étape où tombe son milieu ; seuls ceux d'une étape de course **avec une plage** sont jugés : « 5 km sur 5 dans la plage (6:00–6:20 /km) ». Sans plage d'allure, la plage de FC. Et la durée : « 42 min pour 40 prévues » | Les plages sont celles des zones **d'aujourd'hui** : un seuil qui a bougé depuis déplace la plage d'hier — c'est dit sous le chiffre |
| D8 | Le fractionné | **Pas jugé au kilomètre** : un bloc de 3 minutes ne remplit pas un palier. La durée seule, et la phrase le dit | Le cahier voudrait le respect par bloc ; il faudrait les tours de la montre, pas les paliers — V2 |
| D9 | Une séance du plan sans coach | **La durée seule** : le plan de R5 ne porte pas de plage | — |

---

## 2. Les surfaces

- `training/intensity.py`, pur : le facile, le modéré, le dur, et les minutes hors compte.
- `TrainingView` : `intensity`, `pains` (un point par jour de la courbe), et pour chaque
  semaine `total_min`, `share`, `text`.
- `coach/adherence.py`, pur : les paliers d'une sortie contre les étapes d'une séance.
- `GET /api/activity/runs/{id}/adherence` : le respect, ou `planned: false`.
- L'écran `/charge` ; la carte « Forme » de l'accueil ; une carte « Séance prévue » sur
  l'analyse d'une sortie.

---

## 3. Ce que ce lot ne fait pas

- **Le respect par bloc d'un fractionné** (D8).
- **Les prédictions de chrono et l'allure à FC donnée** (DSH-06, priorité S).
- **Le compte à rebours de la course A sur l'accueil** (DSH-07) : il est sur `/plan`.

---

## 4. Journal

### R10 livré (20 octobre 2026)

Livré tel que planifié. CA-04 rejoué en test sur la séance du cahier — une étape « Speed
Limiter » de 6:00 à 6:20 /km, cinq kilomètres pleins dedans et un reliquat : « 5 km sur 5
dans la plage », le reliquat ignoré. Rejoué à l'écran sur la vraie API, en mémoire, avec
huit semaines semées : une séance du coach acceptée, une sortie de six kilomètres dont deux
trop lents, « 4 km sur 6 dans la plage (5:42–6:27 /km) ».

#### Ce que le passage à l'écran a trouvé

- **Les trois chiffres de la forme se mélangeaient** : `Stat` rend son libellé et sa valeur
  côte à côte, et la grille les rangeait comme six cases.
- **La fatigue sortait du cadre de la courbe** : l'échelle ne tenait compte que de la
  forme. Le serveur rend désormais les bornes communes des deux.
- **Les tons étaient à l'envers** : dans la charte RunFurther, `recover` est le rouge de
  l'alerte et `effort` le vert du calme. « Facile » s'affichait en rouge, une alerte
  critique en ambre, un « 6 km sur 6 » en rouge.
- **La page débordait** : la phrase d'une semaine (« course 1 h 35, natation 40 min, vélo
  1 h 10 ») ne tient pas dans la colonne de valeur de `Bars`. Le serveur la rend en deux
  morceaux, et le détail passe sous la barre.
- « Forme 71, fatigue 94,9 » : une précision au dixième sur l'une et pas sur l'autre. Les
  deux sont arrondies.
- « 42 » seul en fin de ligne, « min » au début de la suivante : insécables.
- « Relevé du 20/10/2026 » : l'année ne disait rien.

#### Laissé, et pourquoi

- **La frise dessine une barre nulle un jour sans relevé** (D4) : le serveur rend `null`,
  la légende dit « douleur notée ».
- **Le fractionné n'est pas jugé au kilomètre** (D8) : il faudrait les tours de la montre.
- **Les plages sont celles des zones d'aujourd'hui** (D7), et c'est écrit sous le chiffre.
- **Aucune nuit réelle n'a été vue** : celles de l'écran sont semées ; la synchro Garmin
  attend toujours R0. *Le 28 octobre, elle est retirée ([`synchro-garmin.md`](synchro-garmin.md)) :
  aucune nuit n'arrivera plus, et la ligne de l'accueil ne s'affiche que sur une nuit déjà
  stockée.*
