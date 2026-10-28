# Corps — `/corps`, « Poids & mensurations », et `/corps/douleurs`

**Rôle.** Le poids et sa courbe, FC de repos et VFC du matin, les mensurations ; les
douleurs — épisodes ouverts, suivi, patterns — sur leur sous-page depuis M-08
(`cdeda08`), dont `/corps` garde la porte en tête.

**Comment on y arrive.** « Plus » → Chaque jour → Poids & mensurations ; « Noter une pesée »
(état vide de l'accueil) ; entrée de la barre du haut sur ordinateur. La pesée seule se
note aussi dans « Noter » et au parcours du matin. `/corps/douleurs` : la porte en tête de
`/corps`, les alertes de douleur de l'accueil, le rappel de suivi de midi.

Fichiers : [`Body.tsx`](../../frontend/src/routes/Body.tsx),
[`body/`](../../frontend/src/routes/body/) — `Mornings`, `Measurements`, `PainLink` ;
`Pains` (la sous-page), `Pain`, `PainForm`, `PainCheck`, `Patterns`.

---

## 1. Ce que l'écran montre

Haut d'écran rempli : **6 168 px** à l'inventaire — le deuxième plus long de
l'application. Sur le banc du 26 octobre : 5 926 px avant ce lot, 4 540 après le départ
des douleurs, **5 261** avec la carte « Le matin » (voir le `README`).

| Bloc | Ce qu'il montre | Source | Vide / erreur |
|---|---|---|---|
| En-tête | **Parcours du matin** (porte manuelle) | — | — |
| **Douleurs** (porte, M-08) | Chaque épisode ouvert, son état servi, « suivi à noter aujourd'hui » ; un appui ouvre `/corps/douleurs` | `GET /api/pain` | « Aucune douleur en cours » ; en panne, le message du serveur — la porte reste |
| **Indicateurs** | Dernier poids et sa date, variation sur N pesées, écart à l'objectif (cible de `/reglages`), amplitude | `GET /api/body/weight` | tirets, « objectif 70 kg » (défaut serveur) |
| **Le matin** (M-09) | FC de repos ou VFC (segment) sur 30 jours ; la ligne de référence quand chaque point a la sienne ; la phrase servie (« encore N matins ») ; la liste des matins de la fenêtre, corriger, supprimer | `GET /api/body/morning/trend` | « Aucun matin sur les 30 derniers jours » + **Parcours du matin** ; un seul matin : « pas encore de courbe » |
| **Courbe** | Poids, 60 derniers points | même appel que les indicateurs | « Deux pesées suffisent » |
| **Historique** | Toutes les pesées : date, poids, note, source ; corriger, supprimer | même appel | « Aucune pesée » |
| **Nouvelle pesée** | Date (jour du serveur), poids, note | — | « Saisie indisponible » sans le jour serveur |
| **Mensurations** — où j'en suis | Six indicateurs (taille, poitrine, bras, hanches, cuisse, masse grasse) avec leur dernière valeur ; la courbe d'une mesure au choix parmi celles relevées, plage « Tout » | `GET /api/body/measurements`, `GET /api/aggregates/series` | tirets, « Pas encore de courbe » ; « indisponible » sur panne |
| **Nouveau relevé** / **Corriger le relevé du …** | Date (jour du serveur), six mesures | — | « Saisie indisponible » sans le jour serveur |
| **Historique des mensurations** | Les 10 derniers relevés (date, mesures portées, note), puis « Toutes (N) » ; corriger, supprimer | `GET /api/body/measurements` | « Aucun relevé » |

### `/corps/douleurs` (M-08, `cdeda08`)

Remplie : 1 905 px ; vide : 874. En-tête « Douleurs », **Retour au corps**.

| Bloc | Ce qu'il montre | Source | Vide / erreur |
|---|---|---|---|
| **En cours** | Épisodes ouverts : zone, côté, intensité contre la base, consigne (« du facile, sans hausse de volume… »), **Noter aujourd'hui** | `GET /api/pain` | « Aucune douleur notée » (rien du tout) ; « Douleurs indisponibles » |
| **Noter une douleur** | Le formulaire `PainForm` | — | — |
| **Ce qui va avec** | Par zone : sorties avec / sans douleur, pattern trouvé ou ce qu'il manque | `GET /api/pain/patterns` | — |
| **Sorties à renseigner** | Chaque sortie sans réponse : « Une douleur ? » **Non** / **Oui** | même appel | — |
| **Refermées** | Les 5 dernières, puis « Toutes les douleurs refermées (N) » | `GET /api/pain` | — |

## 2. Actions

| Action | Geste | Écrit | Garde |
|---|---|---|---|
| Ajouter / corriger une pesée | formulaire | `POST /api/body/weight` · `PATCH /api/body/weight/{id}` | `If-Match` |
| Supprimer une pesée | deux appuis | `DELETE /api/body/weight/{id}` | `If-Match` |
| Enregistrer des mensurations | formulaire | `POST /api/body/measurements` | addition |
| Corriger des mensurations | « corriger » → même formulaire ; une case vidée efface la valeur | `PATCH /api/body/measurements/{id}` | `If-Match` |
| Supprimer des mensurations | `SwipeRow` : glisser, armer, confirmer | `DELETE /api/body/measurements/{id}` | `If-Match` |
| Noter une douleur | formulaire `PainForm` (zone, côté, intensité, base, moment, type, boiterie), ou **dictée** rangée par le modèle | `POST /api/pain/parse` (rien), `POST /api/pain` | addition |
| Noter une douleur depuis l'assistant (M-10) | `pain.add` dans le fil — du jour ou de la veille, marquée `ia`, « Annuler » sur la carte | `POST /api/pain` par le service ; l'annulation `DELETE /api/pain/{id}` | addition, `If-Match` à l'annulation |
| Répondre « pas de douleur » sur une sortie | Non | `POST /api/pain/none` | addition |
| Supprimer un relevé de douleur | deux appuis | `DELETE /api/pain/{id}` | `If-Match` |
| Corriger un matin (M-09) | « corriger » → formulaire date, FC, VFC ; une case vidée efface | `PATCH /api/body/morning/{id}` | `If-Match` |
| Supprimer un matin (M-09) | `SwipeRow` : glisser, armer, confirmer | `DELETE /api/body/morning/{id}` | `If-Match` |
| Ouvrir le parcours du matin | bouton | — | — |
| Ouvrir les douleurs | la porte en tête | — | — |

## 3. Constats

- ~~**Trois pages en une.**~~ Les douleurs ont leur adresse (M-08, `cdeda08`) ; `/corps`
  garde poids, matin et mensurations, et la porte des douleurs en tête. Le constat
  était : poids, mensurations, douleurs — trois sujets, trois rythmes (tous
  les matins, une fois par mois, après une sortie), une seule adresse de 6 168 px. Les
  douleurs, en bas, sont le bloc que le coach lit et que le matin et le soir alimentent :
  on y arrive en dernier (M-08).
- ~~**Une mensuration ne se corrige ni ne se supprime.**~~ Corrigé (M-08, `ae706b7`) :
  un historique (les 10 derniers, puis « Toutes (N) »), « corriger » rouvre le formulaire,
  `SwipeRow` supprime, `If-Match` sur les deux.
- ~~**La courbe des mensurations est sur l'accueil, pas ici.**~~ Corrigé (M-08,
  `ae706b7`) : `/corps` a la sienne. Celle de l'accueil est partie avec M-06 (`c67f06f`).
- ~~**FC de repos et VFC appartiennent au corps et n'y sont pas.**~~ Corrigé (M-09,
  `96d81d9`) : la carte « Le matin », sous les indicateurs du poids — courbe sur trente
  jours, référence servie, liste qui se corrige et se supprime.
- **Le libellé dit « Poids & mensurations »** d'un écran qui porte aussi le matin et la
  porte des douleurs ; ni « Plus » ni la barre ne nomment les douleurs, alors qu'elles
  changent la séance du lendemain. Laissé à M-12 et M-13 (renommer après avoir rangé).
- **La couleur d'une même variation diffère de l'accueil** (« en hausse » en rouge ici, en
  vert sur `/`) : déjà relevé par `sortie-publique.md` §4.3.

## 4. Non vu

La dictée d'une douleur (pas de micro) ; un pattern établi (il faut plus de sorties
renseignées que le banc n'en a).
