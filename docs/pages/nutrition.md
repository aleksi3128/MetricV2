# Nutrition — `/nutrition` et `/nutrition/catalogue`

**Rôle.** Noter ce qu'on mange aujourd'hui, voir où en sont protéines et calories, relire
les jours passés, tenir le catalogue des aliments.

**Comment on y arrive.** « Plus » → Chaque jour → Nutrition ; « Ajouter un repas » dans la
feuille « Noter », qui ouvre directement la feuille d'ajout (`?ajout=repas`, M-23) ; la ligne « Protéines » de l'accueil ; entrée de la barre du haut sur
ordinateur.

Fichiers : [`Nutrition.tsx`](../../frontend/src/routes/Nutrition.tsx),
[`nutrition/`](../../frontend/src/routes/nutrition/) — `MealSheet`, `MealDetail`,
`History`, `Catalog`, `AddFoodSheet`, `FoodSheet`, `Ingredients`, `ScanStep`.

---

## 1. `/nutrition` — Repas du jour

Haut d'écran rempli : 3 124 px (3 312 avant M-23 ; banc du 22 octobre au soir, deux repas, quatre favoris).

| Bloc | Ce qu'il montre | Source | Vide / erreur |
|---|---|---|---|
| En-tête | Date du serveur ; **Ajouter un repas** | `GET /api/nutrition` | — |
| **Totaux** | Anneaux protéines et calories contre leur cible ; tuiles sucres ajoutés (plafond), repas notés, AG saturés, fibres — du jour que le segment du journal a choisi | même appel (`?day=` pour hier) | tirets, « aucun repas chiffré » ; en panne, la section se tait |
| **Historique** | 1 mois / 3 mois / 1 an : grille des calories par jour (heatmap), moyenne et écart à l'objectif, jours dans la cible ±10 %, courbe des calories, courbe des protéines, profil de la semaine, d'où viennent les calories | `GET /api/nutrition/history` | « Pas encore de courbe… » par bloc |
| **Journal** | Segment **Aujourd'hui / Hier** (les deux jours servis) ; les repas du jour choisi : heure (ou « heure non relevée »), type, description, protéines, sucres, calories ; un appui ouvre la fiche. Sur hier, le titre devient « Repas d'hier » | `GET /api/nutrition`, `GET /api/nutrition?day=<date servie>` | « Aucun repas aujourd'hui » ; « Aucun repas noté hier » et **Rattraper un repas d'hier** ; « Journal indisponible » |
| **Favoris** | Les repas récurrents, à gérer : **retirer** (deux appuis). Ils se rejouent dans la feuille (M-23) | même appel | « Aucun favori. Un repas du journal y entre depuis sa fiche » |
| Pied | Lien **Catalogue alimentaire** | — | — |

### Actions

| Action | Geste | Écrit | Garde |
|---|---|---|---|
| Ajouter un repas | feuille `MealSheet`, trois modes (§3), aujourd'hui ou hier — sur hier quand le journal montre hier | `POST /api/nutrition` ou `POST /api/nutrition/composed` (champ `day`) | addition |
| Ouvrir la fiche d'un repas | appui sur la ligne | — | — |
| Corriger un repas | fiche → Corriger (description, valeurs) | `PATCH /api/nutrition/{id}` | `If-Match` |
| Mettre un repas en favori | fiche → Ajouter aux favoris | `POST /api/nutrition/favorites` | addition |
| Supprimer un repas | « supprimer », deux appuis | `DELETE /api/nutrition/{id}` | `If-Match` |
| Rejouer un favori | feuille d'ajout, un appui sur sa pastille, au jour choisi ; pour hier, un second appui sur son type | `POST /api/nutrition/favorites/{id}/replay` (`day`, `meal_type` — exigé pour hier) | addition |
| Retirer un favori | « retirer », deux appuis | `DELETE /api/nutrition/favorites/{id}` | `If-Match` |

## 2. `/nutrition/catalogue` — Catalogue alimentaire

Plage Jour / Semaine / Mois / 3 mois ; ce qui a été mangé (quantités, seulement les repas
composés — « 0 sur 2 repas cette semaine ») ; « Au catalogue, jamais consigné » ;
**Ajouter un aliment** (nom, portion, valeurs, ou **Scanner un code-barres** → Open Food
Facts). Feuille d'un aliment : corriger, reprendre les valeurs de la base, l'ajouter au
catalogue s'il n'y est pas. Source : `GET /api/nutrition/catalog`,
`GET /api/nutrition/catalog/{id}`, `GET /api/nutrition/products/{code}`. Écrit :
`POST/PATCH/DELETE /api/nutrition/ingredients`.

## 3. La feuille « Ajouter un repas »

| Mode | Ce qu'il demande | IA |
|---|---|---|
| Description | Une phrase → **Estimer les macros** → valeurs proposées (`AiBlock`, `Stepper` `proposed`) → **Utiliser ces valeurs** | oui (`POST /api/nutrition/analyze`) |
| Repas composé | Des aliments du catalogue et leurs poids ; total recalculé à la frappe | non (`POST /api/nutrition/compose`) |
| Valeurs à la main | Protéines, calories, sucres ; « Plus de valeurs » : AG saturés, fibres | non |

Avant les trois modes, le **jour** — aujourd'hui (par défaut) ou hier, deux jours servis
par `GET /api/nutrition` (`days`) — puis les **favoris** en bande défilante, dans l'ordre
servi : un appui rejoue le favori et ferme la feuille (M-23). Pour hier, l'appui demande
d'abord **quel repas** — les types en pastilles, à la place de la bande, et « Un autre
favori » pour revenir : le type pose l'heure type, et celui de l'heure présente ne dit
rien d'un repas d'hier. Le segment du
jour revient en tête du formulaire, sur le même état. Pour hier, le serveur pose l'heure
type du repas (petit-déjeuner 08:00, déjeuner 12:30, collation 16:30, dîner 20:00) et
l'écrit **non relevée** (`time_recorded`) : la fiche d'un tel repas titre « Hier, heure non
relevée ». `/nutrition?ajout=hier` ouvre la feuille sur hier — c'est là que mène le
parcours du matin ; `/nutrition?ajout=repas`, sur le jour par défaut — c'est là que mène
« Noter ». Puis type de repas
— proposé selon l'heure **aujourd'hui** ; pour hier, rien n'est présélectionné (« Choisir
le repas ») et l'enregistrement attend un choix — et **Enregistrer le repas**. Brouillon gardé quinze minutes dans le
navigateur, jour compris.

## 4. Constats

- ~~**Aucun repas ne se date dans le passé.**~~ Corrigé pour la feuille (M-01,
  `331ae7e`) et pour le rejeu d'un favori (`34bbce7`) ; l'heure posée se dit non relevée
  (`7c895ff`). Restent la fiche (l'heure ne s'y corrige toujours pas) et l'assistant
  (« noter un repas **du jour** », M-10).
- ~~**Un repas rattrapé est intouchable.**~~ Corrigé (`74dfc9d`) : le journal lit hier, sa
  fiche s'ouvre, se corrige, et la ligne se supprime en deux appuis. **Au-delà d'hier**, un
  repas ne s'ouvre toujours nulle part : ouvrir un jour depuis la grille de l'historique
  est une autre fiche.
- ~~**Les favoris ne sont pas dans la feuille d'ajout.**~~ Corrigé (M-23, `34bbce7`) : ils
  ouvrent la feuille, un appui rejoue ; « Noter » ouvre la feuille. ~~Un favori rejoué
  prend le type de l'heure présente, même pour hier.~~ Corrigé (`d1de02d`) : pour hier, la
  feuille le demande et le serveur l'exige ; la saisie normale ne le présélectionne plus.
- ~~**Un formulaire de création toujours déplié sur un écran de lecture.**~~ Corrigé (M-23,
  `34bbce7`) : la carte ne fait plus que retirer ; la fiche d'un repas est la seule porte.
- **Trois listes de « ce que je mange »** : le journal (aujourd'hui), l'historique
  (calories par jour), le catalogue (aliments mangés — mais seulement depuis les repas
  composés, ce que la page dit elle-même). Les trois sont légitimes ; c'est le catalogue
  qui surprend, avec « 0 sur 2 repas ».
- **L'historique compte la journée en cours.** Sur le banc, deux repas à 13 h donnent
  « Moyenne 1 300 kcal, écart −1 100 kcal/j » sur une plage d'un jour. L'hydratation exclut
  le jour en cours de ses moyennes depuis la fiche 19 de l'audit ; la nutrition non.

## 5. Non vu

L'estimation réelle d'une description ; le scan d'un code-barres (pas de caméra) ; les
repas anciens photographiés.
