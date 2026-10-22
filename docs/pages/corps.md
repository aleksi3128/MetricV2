# Corps — `/corps`, « Poids & mensurations »

**Rôle.** Le poids et sa courbe, les mensurations, et les douleurs — épisodes ouverts,
suivi, patterns.

**Comment on y arrive.** « Plus » → Mesurer → Poids & mensurations ; « Noter une pesée »
(état vide de l'accueil) ; entrée de la barre du haut sur ordinateur. La pesée seule se
note aussi dans « Noter » et au parcours du matin.

Fichiers : [`Body.tsx`](../../frontend/src/routes/Body.tsx),
[`body/`](../../frontend/src/routes/body/) — `Pain`, `PainForm`, `PainCheck`, `Patterns`.

---

## 1. Ce que l'écran montre

Haut d'écran rempli : **6 168 px** — le deuxième plus long de l'application.

| Bloc | Ce qu'il montre | Source | Vide / erreur |
|---|---|---|---|
| En-tête | **Parcours du matin** (porte manuelle) | — | — |
| **Indicateurs** | Dernier poids et sa date, variation sur N pesées, écart à l'objectif (cible de `/reglages`), amplitude | `GET /api/body/weight` | tirets, « objectif 70 kg » (défaut serveur) |
| **Courbe** | Poids, 60 derniers points | même appel | « Deux pesées suffisent » |
| **Historique** | Toutes les pesées : date, poids, note, source ; corriger, supprimer | même appel | « Aucune pesée » |
| **Nouvelle pesée** | Date (jour du serveur), poids, note | — | « Saisie indisponible » sans le jour serveur |
| **Mensurations** — où j'en suis | Six indicateurs (taille, poitrine, bras, hanches, cuisse, masse grasse) avec leur dernière valeur ; la courbe d'une mesure au choix parmi celles relevées, plage « Tout » | `GET /api/body/measurements`, `GET /api/aggregates/series` | tirets, « Pas encore de courbe » ; « indisponible » sur panne |
| **Nouveau relevé** / **Corriger le relevé du …** | Date (jour du serveur), six mesures | — | « Saisie indisponible » sans le jour serveur |
| **Historique des mensurations** | Les 10 derniers relevés (date, mesures portées, note), puis « Toutes (N) » ; corriger, supprimer | `GET /api/body/measurements` | « Aucun relevé » |
| **Douleurs** | Épisodes ouverts : zone, côté, intensité contre la base, consigne (« du facile, sans hausse de volume… »), **Noter aujourd'hui** ; épisodes passés ; **Noter une douleur** | `GET /api/pain` | « Aucune douleur notée » |
| **Ce qui va avec** | Par zone : sorties avec / sans douleur, pattern trouvé ou ce qu'il manque | `GET /api/pain/patterns` | — |
| **Sorties à renseigner** | Chaque sortie sans réponse : « Une douleur ? » **Non** / **Oui** | même appel | — |

## 2. Actions

| Action | Geste | Écrit | Garde |
|---|---|---|---|
| Ajouter / corriger une pesée | formulaire | `POST /api/body/weight` · `PATCH /api/body/weight/{id}` | `If-Match` |
| Supprimer une pesée | deux appuis | `DELETE /api/body/weight/{id}` | `If-Match` |
| Enregistrer des mensurations | formulaire | `POST /api/body/measurements` | addition |
| Corriger des mensurations | « corriger » → même formulaire ; une case vidée efface la valeur | `PATCH /api/body/measurements/{id}` | `If-Match` |
| Supprimer des mensurations | `SwipeRow` : glisser, armer, confirmer | `DELETE /api/body/measurements/{id}` | `If-Match` |
| Noter une douleur | formulaire `PainForm` (zone, côté, intensité, base, moment, type, boiterie), ou **dictée** rangée par le modèle | `POST /api/pain/parse` (rien), `POST /api/pain` | addition |
| Répondre « pas de douleur » sur une sortie | Non | `POST /api/pain/none` | addition |
| Supprimer un relevé de douleur | deux appuis | `DELETE /api/pain/{id}` | `If-Match` |
| Ouvrir le parcours du matin | bouton | — | — |

## 3. Constats

- **Trois pages en une.** Poids, mensurations, douleurs : trois sujets, trois rythmes (tous
  les matins, une fois par mois, après une sortie), une seule adresse de 6 168 px. Les
  douleurs, en bas, sont le bloc que le coach lit et que le matin et le soir alimentent :
  on y arrive en dernier (M-08).
- ~~**Une mensuration ne se corrige ni ne se supprime.**~~ Corrigé (M-08, `ae706b7`) :
  un historique (les 10 derniers, puis « Toutes (N) »), « corriger » rouvre le formulaire,
  `SwipeRow` supprime, `If-Match` sur les deux.
- ~~**La courbe des mensurations est sur l'accueil, pas ici.**~~ Corrigé (M-08,
  `ae706b7`) : `/corps` a la sienne. Celle de l'accueil reste, jusqu'à M-06.
- **FC de repos et VFC appartiennent au corps et n'y sont pas** : saisies au matin,
  corrigeables seulement en rouvrant le parcours, jamais relues en série (M-09).
- **Le libellé dit « Poids & mensurations » d'un écran qui porte aussi les douleurs** ; ni
  « Plus » ni la barre ne nomment les douleurs, alors qu'elles changent la séance du
  lendemain.
- **La couleur d'une même variation diffère de l'accueil** (« en hausse » en rouge ici, en
  vert sur `/`) : déjà relevé par `sortie-publique.md` §4.3.

## 4. Non vu

La dictée d'une douleur (pas de micro) ; un pattern établi (il faut plus de sorties
renseignées que le banc n'en a).
