# Plan de course — `/plan`

**Rôle.** Les courses qu'on vise (A, B, C), leurs conflits, et le plan périodisé jusqu'à
la prochaine course A, à poser au planning d'un geste.

**Comment on y arrive.** « Plus » → Décider → Plan de course ; entrée « Plan » de la barre
du haut sur ordinateur. Aucun lien depuis un autre écran.

Fichier : [`Plan.tsx`](../../frontend/src/routes/Plan.tsx).

---

## 1. Ce que l'écran montre

Haut d'écran rempli : 2 287 px.

| Bloc | Ce qu'il montre | Source | Vide / erreur |
|---|---|---|---|
| Conflit (s'il y en a) | « Deux objectifs A » et la phrase qui tranche ; **Oui, fais-le** / non | `GET /api/races` | — |
| **Courses visées** | Nom, date, distance, priorité, chrono visé ; supprimer ; **Ajouter une course** (formulaire en place) | même appel | « Aucune course visée » |
| **Ce que le coach a changé** | Les déplacements faits par le coach, à défaire | `GET /api/planning/changes` | bloc absent |
| **Plan jusqu'à la course A** | Synthèse (semaines, volume de départ et de pic, affûtage), avertissement de préparation courte ; les quatre semaines qui viennent, séance par séance en notation ; les autres repliées ; **Poser au planning** | `GET /api/races/plan/{race_id}` | « Plan indisponible » |
| **Agenda** | Lien public de l'agenda iCloud : **Relier l'agenda**, **Oublier le lien** | `GET /api/planning/agenda` | champ vide |

## 2. Actions

| Action | Geste | Écrit | Garde |
|---|---|---|---|
| Ajouter une course visée | formulaire | `POST /api/races` | addition |
| Supprimer une course visée | deux appuis | `DELETE /api/races/{id}` | `If-Match` |
| Trancher un conflit | Oui / non | `POST /api/races/conflicts/{key}` | — |
| Poser le plan | bouton ; **armé** s'il remplace un plan déjà posé | `POST /api/races/plan/{race_id}` · `DELETE /api/races/plan` | deux appuis au remplacement |
| Défaire un changement du coach | « Non, remets comme avant » | `POST /api/planning/changes/{key}` | — |
| Relier / oublier l'agenda | champ | `PATCH /api/planning/agenda` | — |

## 3. Constats

- **Une course visée ne se corrige pas.** Le serveur a la route
  (`PATCH /api/races/{id}`, « Corriger une course visée »), aucun écran ne l'appelle :
  changer un chrono visé ou une date, c'est supprimer puis recréer (M-17).
- **Deux blocs n'ont rien de propre au plan de course** : l'agenda (il sert à toutes les
  séances) et « Ce que le coach a changé » (toutes les replanifications). Ils sont ici
  parce que la page est née avec la replanification ; on ne les y cherche pas (M-03).
- **Le mot « course » désigne ici une compétition**, et partout ailleurs une sortie
  (« Enregistrer une course », « Toutes tes courses »). « Ajouter une course » sur `/plan` et
  « Ajouter une course » sur `/activite/courses` sont deux boutons au même libellé qui
  n'écrivent pas la même chose (M-13).
- **Le plan et l'objectif ne se parlent pas à l'écran.** Une course A datée est l'objectif
  le plus concret qui soit ; `/objectif` et le bloc « Où je vais » de l'accueil n'en disent
  rien (M-19).

## 4. Non vu

Un conflit A/A ; un agenda relié ; un plan déjà posé puis remplacé.
