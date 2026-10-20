# Objectifs de course et plan périodisé

Lot **R5** de [`runfurther-dans-metric.md`](runfurther-dans-metric.md), plan du 20/10/2026.
Exigences PLN-02, PLN-05, PLN-08 ; critères d'acceptation CA-05 et CA-07.

Metric planifie séance par séance : le coach du matin choisit la prochaine, le modèle peut
proposer une semaine. Personne ne sait **vers quoi** on court. Ce lot ajoute des courses
visées, classées A, B ou C, et un plan qui y mène : des phases, des semaines de récupération,
un affûtage, et une notation de séance qu'un entraîneur écrirait.

Décisions prises seul (délégation du 19/10).

---

## 1. Les décisions

| # | Question | Décision | Ce que ça coûte |
|---|---|---|---|
| D1 | Qui fait le plan | **Des règles**, pas un modèle — comme le cadre du coach | Un plan sans fantaisie ; c'est voulu, chaque semaine se justifie |
| D2 | Les phases | **Base, développement, spécifique, affûtage**, en parts de la durée disponible ; une semaine allégée toutes les quatre (×0,7) | — |
| D3 | La progression | **+8 % par semaine au plus**, plafonnée par distance — +17 % sur deux semaines, sous les 30 % de Nielsen | Un débutant qui part de 10 km/semaine n'atteint pas 65 km avant un marathon proche : le plan le dit |
| D4 | L'affûtage | **Volume réduit de 40 à 60 %** sur 1 à 3 semaines selon la distance, **intensité maintenue** (Bosquet 2007) ; repos à J-2 et J-1 | — |
| D5 | Trois séances par semaine | **Mardi, jeudi, dimanche** par défaut ; la longue le week-end | L'agenda (R6) les déplacera ; jamais deux jours de course d'affilée, comme le coach |
| D6 | La notation (PLN-05) | **`EF`, `SL`, `T` (seuil), `VMA`, `AS10` / `ASS` / `ASM` (allure spécifique), `LD` (lignes droites), `RC` (retour au calme)** — `15' EF + 3 × 8' T r2' + 10' RC` | Une notation lue par l'œil, pas analysée comme celle de la nage |
| D7 | La durée d'une séance en kilomètres | **Estimée à l'allure facile médiane des 28 derniers jours**, 6'30/km sans historique | C'est une durée **prévue** — une valeur de planning, pas une mesure |
| D8 | Le triathlon | **La part course seulement** dans ce lot ; natation et vélo restent à poser | MSP-03 est en V2 |
| D9 | Deux objectifs A qui se gênent (CA-07) | **Le coach tranche par règle** : la course la plus exigeante reste A, l'autre passe B — et **rien ne change sans un oui** | Un conflit refusé n'est plus redemandé |
| D10 | Écrire le plan au planning | **Un geste** : « Poser au planning » écrit les séances à venir, marquées `plan` ; le reposer remplace les séances `plan` futures | Une séance `plan` déplacée à la main redevient la sienne seulement si on la corrige — elle reste marquée `plan` |
| D11 | Où ça vit | **Un écran `/plan`**, dans « Plus » | `/objectif` reste celui des métriques (poids, protéines…) |

### Pourquoi un conflit se tranche par la plus exigeante

Un marathon demande trois à quatre semaines avant de recharger ; un Ironman, vingt semaines
de préparation. Deux objectifs A à neuf semaines d'écart, c'est un bloc qui en mange un
autre. La règle garde en A ce qui demande le plus long bloc et propose l'autre en B — couru,
mais sans affûtage ni pic de forme. Le cahier veut que le coach « tranche, argumente et
demande confirmation » : la règle tranche, la phrase argumente, le bouton demande.

---

## 2. Les données

| Fichier | Contenu |
|---|---|
| `goals/races.csv` | `race_id`, `name`, `date`, `distance` (`5k` · `10k` · `semi` · `marathon` · `sprint` · `olympique` · `70.3` · `ironman`), `priority` (A/B/C), `target`, `note` |
| `goals/race_decisions.csv` | `key`, `decision` (`accepted` · `refused`), `date` — la réponse à un conflit |

Famille *planning* : une cible, pas une mesure.

---

## 3. Les calculs — `races/`, modules purs

- `catalog.py` — par distance : semaines de récupération qui l'entourent, pic de volume,
  plus longue sortie, durée d'affûtage, poids pour trancher.
- `conflicts.py` — deux A trop proches, la proposition, la phrase.
- `periodize.py` — les semaines jusqu'à la course : phase, kilomètres, sortie longue, trois
  séances en notation.

---

## 4. Les surfaces

- `GET/POST /api/races`, `PATCH/DELETE /api/races/{id}` sous `If-Match`.
- `GET /api/races/conflicts`, `POST /api/races/conflicts/{key}` `{accept}`.
- `GET /api/races/{race_id}/plan`, `POST /api/races/{race_id}/plan` (poser), `DELETE
  /api/races/plan` (retirer les séances `plan` à venir).
- L'écran `/plan` : courses, conflit à trancher, plan de la course A.

---

## 5. Ce que ce lot ne fait pas

- **Placer selon l'agenda** (PLN-03) et **replanifier** (PLN-04) : R6.
- **Natation et vélo** d'un triathlon (MSP-03, V2).
- **Recaler le plan sur le réalisé** : un plan posé ne bouge pas seul ; il se repose.

---

## 6. Journal

### R5 livré (20 octobre 2026)

Livré tel que planifié. CA-05 rejoué sur un 10 km du 18/10 : la semaine de course porte
13,2 km pour un pic à 26,4 (−50 %), un rappel à l'allure AS10 cinq jours avant, rien à J-2
ni à J-1. CA-07 rejoué de bout en bout : un marathon et un Ironman en A à onze semaines,
la proposition, puis le oui qui passe le marathon en B — ou le non, qui ne change rien et
ne redemande plus.

#### Ce que le passage à l'écran a trouvé

- La phrase du conflit disait « le plus exigeant (ironman) » — un libellé de distance en
  minuscules entre parenthèses. Récrite.
- **Un plan qui n'atteint pas son pic se taisait.** Partir de 10,5 km par semaine mène à
  36 km avant un marathon, quand le pic visé est 65 : le plan le dit désormais, avec sa
  raison (+8 % par semaine au plus).
- Vingt-quatre semaines dépliées faisaient une page interminable : les quatre premières,
  puis « Toutes les semaines ».
- Une séance posée au planning n'avait aucune marque : badge « plan » dans le jour, et non
  « proposée », réservé à ce qu'un modèle propose.

#### Laissé, et pourquoi

- **Le plan ne regarde pas l'agenda** et pose mardi, jeudi, dimanche : c'est R6.
- **Natation et vélo d'un triathlon** ne sont pas planifiés (MSP-03, V2).
- **Les seuils du catalogue** (pics, sorties longues, affûtages) sont des valeurs de départ
  de la littérature courante, à relire avec un entraîneur.

