# Plan de course — `/plan`

**Rôle.** Les courses qu'on vise (A, B, C), leurs conflits, et le plan périodisé jusqu'à
la prochaine course A, à poser au planning d'un geste.

**Comment on y arrive.** « Plus » → Prévoir → Plan de course ; entrée « Plan » de la barre
du haut sur ordinateur. Aucun lien depuis un autre écran.

Fichier : [`Plan.tsx`](../../frontend/src/routes/Plan.tsx).

---

## 1. Ce que l'écran montre

Haut d'écran rempli : 2 287 px à l'inventaire ; 1 955 depuis M-03, sur le banc du 26 octobre
(2 839 avant) — voir le `README`.

| Bloc | Ce qu'il montre | Source | Vide / erreur |
|---|---|---|---|
| Conflit (s'il y en a) | « Deux courses visées en A » et la phrase qui tranche ; **Oui, fais-le** / non | `GET /api/races` | — |
| **Courses visées** | Nom, date, distance, priorité, chrono visé ; supprimer ; **Ajouter une course visée** (formulaire en place) | même appel | « Aucune course visée » |
| ~~**Ce que le coach a changé**~~ | Parti sur `/planning` (M-03, `c9b1433`) | — | — |
| **Plan jusqu'à la course A** | Synthèse (semaines, volume de départ et de pic, affûtage), avertissement de préparation courte ; les quatre semaines qui viennent, séance par séance en notation ; les autres repliées ; **Poser au planning** | `GET /api/races/plan/{race_id}` | « Plan indisponible » |
| ~~**Agenda**~~ | Parti sur `/planning` (M-03, `c9b1433`) | — | — |

## 2. Actions

| Action | Geste | Écrit | Garde |
|---|---|---|---|
| Ajouter une course visée | formulaire | `POST /api/races` | addition |
| Supprimer une course visée | deux appuis | `DELETE /api/races/{id}` | `If-Match` |
| Trancher un conflit | Oui / non | `POST /api/races/conflicts/{key}` | — |
| Poser le plan | bouton ; **armé** s'il remplace un plan déjà posé | `POST /api/races/plan/{race_id}` · `DELETE /api/races/plan` | deux appuis au remplacement |

## 3. Constats

- **Une course visée ne se corrige pas.** Le serveur a la route
  (`PATCH /api/races/{id}`, « Corriger une course visée »), aucun écran ne l'appelle :
  changer un chrono visé ou une date, c'est supprimer puis recréer (M-17).
- ~~**Deux blocs n'ont rien de propre au plan de course**~~ Corrigé (M-03, `c9b1433`) :
  l'agenda et « Ce que le coach a changé » sont sur `/planning`. L'écran ne porte plus que
  les courses visées, leurs conflits et le plan, et n'appelle plus aucune route du
  planning.
- ~~**Le mot « course » désigne ici une compétition**, et partout ailleurs une sortie.~~
  Corrigé (M-13, `6f53740`, `827b293`) : sur `/plan`, c'est une « course visée » partout
  (« Ajouter une course visée », « Nouvelle course visée », « Deux courses visées en A ») ;
  le surtitre dit « Course à pied ». « Ajouter une course » ne reste que sur
  `/activite/courses`, où c'est une sortie. La pastille « A — l'objectif » dit « A — la
  principale », et la note du jour de course posée par le plan « priorité A » — son
  préfixe « Course : » reste, c'est le marqueur que lit le coach.
- **Le plan et l'objectif ne se parlent pas à l'écran.** Une course A datée est l'objectif
  le plus concret qui soit ; `/objectif` et le bloc « Où je vais » de l'accueil n'en disent
  rien (M-19).

## 4. Non vu

Un conflit A/A ; un plan déjà posé puis remplacé.
