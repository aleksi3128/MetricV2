# Planifier une séance, deuxième version

Plan du 20/10/2026, après deux séries de questions. Feu vert le 20/10.

Aujourd'hui, « Planifier une séance » est un formulaire générique : une nature (natation
présélectionnée), une date à ressaisir, une heure, un titre libre, une durée préréglée à
60 minutes, une note. Une course n'y a ni type, ni allure, ni distance — si bien que le
respect chiffré de R10 (« 5 km sur 5 dans la plage ») ne marche que pour les séances du
coach. La muscu est un titre et un lien Cadence collé dans la note. Rien ne prévient d'une
course la veille, d'une douleur ouverte ou d'un rendez-vous dans l'agenda.

---

## 1. Ce que tu as demandé

| Sujet | Réponse |
|---|---|
| La course | type de séance et allures calculées, **distance visée**, **FC visée**, **perf visée**, **la séance écrite bloc par bloc** (`5 × (1 km à 6'00 + 80 m de ligne droite à 3'30)`), et partir de la proposition du coach |
| L'écriture | **en notation lue par le serveur, et au doigt** |
| La FC | la plage de la zone, calculée, **modifiable en bpm** |
| La perf visée | **allure ou temps par bloc**, **chrono de la séance**, **effort perçu visé** |
| L'ouverture | le jour touché, **rien d'imposé** |
| Les garde-fous | **règles d'entraînement**, **conflit d'agenda**, **créneau libre proposé** |
| La muscu | **choisir dans les circuits Cadence** |
| Garmin | **pas d'accès au compte** : les `.fit` restent la seule voie |

---

## 2. Les décisions

| # | Question | Décision | Ce que ça coûte |
|---|---|---|---|
| D1 | La notation | **Celle de R5, rendue lisible par le serveur** — `15' EF + 5 × (1 km 6'00 + 80 m LD 3'30) + 10' RC`. Un bloc : une quantité (`1 km`, `800 m`, `15'`, `1h10`), un sigle facultatif (`EF`, `SL`, `T`, `VMA`, `AS10`…, `LD`, `RC`), une cible facultative (`6'00` ou `5'40-5'50` par km, `en 4'10` pour le bloc, `140-150` bpm, `Z2`, `RPE7`). Des groupes répétés `N × ( … )`, une récupération `r1'30` ou `r200 m` | Une grammaire de plus à tenir, sur le modèle de celle de la nage (`core/swim_notation.py`) |
| D2 | Ce que le serveur rend | Les blocs **réécrits avec leur cible** (« 1 km à 6:00 /km · 138–150 bpm »), la **distance** et la **durée** totales — l'une déduite de l'autre par l'allure —, ou **la ligne fautive** et pourquoi. Aperçu 400 ms après la dernière frappe, comme la nage | — |
| D3 | Les cibles par défaut | Un sigle sans cible prend **la plage de sa zone**, allure et FC, depuis tes zones (FC max, allure seuil) ; une cible écrite **l'emporte**. Sans référence, le bloc reste sans chiffre et le dit | Les zones d'aujourd'hui, comme R10 |
| D4 | Au doigt | **Un constructeur qui écrit la notation** : ajouter un bloc, choisir sa nature, sa quantité, sa cible, le répéter N fois. Il n'a pas sa propre logique : il produit le texte, le serveur le lit | — |
| D5 | Partir d'un type | Les puces **footing, sortie longue, tempo, seuil, fractionné, côtes, progressif, récupération** écrivent la séance-type du coach (`coach/catalog.py`) en notation, pour la durée choisie — à retoucher | — |
| D6 | Partir du coach | Si le coach a une proposition pour ce jour, **« Reprendre la séance du coach »** l'écrit en notation dans le formulaire | — |
| D7 | La perf visée | **Par bloc** dans la notation ; **chrono de la séance** et **effort perçu visé** en deux champs facultatifs | — |
| D8 | L'ouverture | **Le jour touché**, aucune nature présélectionnée, **aucune durée** : pour une course, la durée vient de la notation ; pour le reste, elle se choisit | Un geste de plus pour une nage d'une heure ; c'est le prix de « aucune valeur inventée » |
| D9 | Les garde-fous | Avant « Planifier », le serveur rend des **avertissements en phrases, qui ne bloquent pas** : course la veille ou le lendemain, douleur ouverte (arrêt / adaptée), saut de volume, affûtage d'une course A, **chevauchement avec l'agenda**. Sans heure, il **propose le premier créneau libre** du jour, d'un appui | Un appel de plus à l'ouverture et à chaque changement de date ou d'heure |
| D10 | La montre | **« Pour la montre (.fit) »** sur toute course planifiée en notation : les blocs, les répétitions imbriquées et les cibles, comme le coach le fait déjà | À copier par câble ou par l'appli Garmin : pas d'accès au compte |
| D11 | Le respect, après | Une sortie **importée en `.fit`** se juge **bloc par bloc** sur sa trace seconde par seconde : chaque bloc est retrouvé par sa distance ou sa durée, son allure moyenne comparée à sa cible — « 4 répétitions sur 5 dans la cible ; les lignes droites à 3:28, 3:35… ». Puis le chrono visé, et l'effort perçu visé contre celui que tu notes. **Sans `.fit`** : la durée et la distance seulement | Le découpage suppose que tu as couru les blocs dans l'ordre ; un bloc sauté décale la suite — la page le dira quand les distances ne collent pas |
| D12 | La muscu | **Choisir un circuit Cadence enregistré** : titre, durée et lien posés tout seuls ; le titre libre reste possible | — |
| D13 | Garmin sans compte | **La synchro est retirée de l'écran** : plus de carte Garmin dans les réglages, plus de « la nuit arrive avec la synchro » sur l'accueil (la nuit ne s'affiche que si elle existe). Le code reste, inerte | — |

---

## 3. Les étapes, chacune livrée et commitée seule

1. **Garmin sans compte** (D13) — petit.
2. **La notation de course** (D1–D3) : le lecteur, l'aperçu, les puces ; le formulaire
   course avec distance, chrono et effort visés ; l'ouverture sans rien d'imposé (D8).
3. **Au doigt, par type, depuis le coach** (D4–D6), et **la muscu par circuit** (D12).
4. **Les garde-fous et le créneau libre** (D9).
5. **La montre et le respect bloc par bloc** (D10–D11).

---

## 4. Ce que ce lot ne fait pas

- **Répéter une séance chaque semaine** : pas demandé.
- **Juger un bloc sans `.fit`** : sans trace, il n'y a que la durée et la distance.
- **Envoyer la séance à la montre sans fil** : pas d'accès au compte Garmin.

---

## 5. Journal

### Étape 1 — Garmin sans compte (20 octobre 2026)

La carte Garmin des réglages et son client d'API sont retirés ; la ligne de nuit de
l'accueil ne s'affiche plus que s'il y a une nuit. Le backend n'a pas bougé : sans
identifiants, la passe de synchro rendait déjà la main sans rien écrire ni dire.

### Étape 2 — la notation de course (20–21 octobre 2026)

`planning/run_notation.py` lit la séance : quantités, sigles, cibles, groupes `N × ( … )`,
récupérations. Ta séance, `15' EF + 5 × (1 km 6'00 + 80 m LD 3'30) + 10' RC`, se lit en
9,6 km et 56 minutes, chaque bloc avec sa plage d'allure et de FC. La durée d'une course
en notation est **déduite** ; l'ouverture n'impose plus ni nature ni durée. Le chrono,
la distance et l'effort visés s'enregistrent (`plan.csv` gagne trois colonnes, vides
ailleurs).

**Le sigle SL a été tranché avec toi** : SL reste la sortie longue (R5), la ligne droite
s'écrit LD. Un « SL » de moins d'un kilomètre est refusé avec la bonne écriture — c'est
exactement ce que ton premier exemple, `80m Sl 3"30'`, aurait donné.

#### Ce que le passage à l'écran a trouvé

- Les plages se coupaient en fin de ligne (« 5:25– » / « 6:08 /km », « au- » / « dessus ») :
  insécables.
- « Visé : en 56:00 » sans distance : « chrono 56:00 ».

#### Ce que les tests ont trouvé

- Quatre tests de nage comptaient sur la natation présélectionnée : ils la choisissent.
- Deux tests figeaient l'en-tête de `plan.csv`.
- Un programme de nage posé sur une course est désormais lu comme une course, donc refusé
  par la notation de course (`run_notation_invalid`) et non plus par la validation.
- `test_harness` a échoué deux fois dans la batterie complète, puis passé deux fois : la
  machine s'est suspendue en pleine exécution (la batterie mesurait plus d'une heure
  d'horloge réelle). Rien dans le code.

#### Laissé

- **Les cases de la grille du mois font 39 px à 360 px**, sous le plancher de 44 : défaut
  de la grille existante, hors de cette étape.
- Les puces de nature défilent à 360 px, comme avant.
