# Nutrition — `/nutrition` et `/nutrition/catalogue`

**Rôle.** Noter ce qu'on mange aujourd'hui, voir où en sont protéines et calories, relire
les jours passés, tenir le catalogue des aliments.

**Comment on y arrive.** « Plus » → Décider → Nutrition ; « Ajouter un repas » dans la
feuille « Noter » ; la ligne « Protéines » de l'accueil ; entrée de la barre du haut sur
ordinateur.

Fichiers : [`Nutrition.tsx`](../../frontend/src/routes/Nutrition.tsx),
[`nutrition/`](../../frontend/src/routes/nutrition/) — `MealSheet`, `MealDetail`,
`History`, `Catalog`, `AddFoodSheet`, `FoodSheet`, `Ingredients`, `ScanStep`.

---

## 1. `/nutrition` — Repas du jour

Haut d'écran rempli : 3 312 px.

| Bloc | Ce qu'il montre | Source | Vide / erreur |
|---|---|---|---|
| En-tête | Date du serveur ; **Ajouter un repas** | `GET /api/nutrition` | — |
| **Totaux** | Anneaux protéines et calories contre leur cible ; tuiles sucres ajoutés (plafond), repas notés, AG saturés, fibres | même appel | tirets, « aucun repas chiffré » |
| **Historique** | 1 mois / 3 mois / 1 an : grille des calories par jour (heatmap), moyenne et écart à l'objectif, jours dans la cible ±10 %, courbe des calories, courbe des protéines, profil de la semaine, d'où viennent les calories | `GET /api/nutrition/history` | « Pas encore de courbe… » par bloc |
| **Journal** | Les repas du jour : heure, type, description, protéines, sucres, calories ; un appui ouvre la fiche | `GET /api/nutrition` | « Aucun repas aujourd'hui » |
| **Favoris** | Les repas récurrents : **rejouer**, **retirer** ; formulaire déplié (nom, protéines, sucres, calories, AG saturés, fibres) + **Enregistrer en favori** | même appel | formulaire seul |
| Pied | Lien **Catalogue alimentaire** | — | — |

### Actions

| Action | Geste | Écrit | Garde |
|---|---|---|---|
| Ajouter un repas | feuille `MealSheet`, trois modes (§3) | `POST /api/nutrition` ou `POST /api/nutrition/composed` | addition |
| Ouvrir la fiche d'un repas | appui sur la ligne | — | — |
| Corriger un repas | fiche → Corriger (description, valeurs) | `PATCH /api/nutrition/{id}` | `If-Match` |
| Mettre un repas en favori | fiche → Ajouter aux favoris | `POST /api/nutrition/favorites` | addition |
| Supprimer un repas | « supprimer », deux appuis | `DELETE /api/nutrition/{id}` | `If-Match` |
| Rejouer un favori | « rejouer » | `POST /api/nutrition/favorites/{id}/replay` | addition |
| Créer / retirer un favori | formulaire ; « retirer », deux appuis | `POST/DELETE /api/nutrition/favorites` | `If-Match` |

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

Puis type de repas (proposé selon l'heure) et **Enregistrer le repas**. Brouillon gardé
quinze minutes dans le navigateur.

## 4. Constats

- **Aucun repas ne se date dans le passé.** Ni la feuille, ni la fiche, ni l'assistant
  (« noter un repas **du jour** »). La fiche le dit : l'heure ne se corrige pas, parce que
  la composer à l'écran serait un calcul de date. Le parcours du matin affirme pourtant
  « Aucun repas noté hier — ils se rattrapent depuis Nutrition » (M-01).
- **Les favoris ne sont pas dans la feuille d'ajout.** « Rejouer » est sur la page, sous
  l'historique, à ~2 800 px du haut ; la feuille « Ajouter un repas » — là où l'on va pour
  noter — propose trois modes et pas celui-là. Et « Noter » → « Ajouter un repas » mène à
  la page, pas à la feuille (M-23).
- **Un formulaire de création toujours déplié sur un écran de lecture.** Le formulaire
  « Enregistrer en favori » occupe la carte Favoris en permanence, alors que la fiche d'un
  repas sait déjà le faire d'un appui (`MealDetail`, « Ajouter aux favoris ») (M-23).
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
