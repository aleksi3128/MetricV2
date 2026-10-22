# Objectif — `/objectif`

**Rôle.** Un seul objectif chiffré, daté de quatre à huit semaines, proposé par le modèle
à partir des données et adopté à la main ; et le bilan de chaque semaine.

**Comment on y arrive.** « Plus » → Décider → Objectif ; « Détail » ou « Fixer un objectif »
dans le bloc « Où je vais » de l'accueil ; entrée de la barre du haut sur ordinateur.

Fichier : [`Goals.tsx`](../../frontend/src/routes/Goals.tsx).

---

## 1. Ce que l'écran montre

| Bloc | Ce qu'il montre | Source | Vide / erreur |
|---|---|---|---|
| **Objectif en cours** | Titre, anneau (ou « avancement indéterminé »), résumé chiffré, fenêtre d'observation, jours restants ; Clore / Abandonner (armé) | `GET /api/goals` | « Aucun objectif en cours » + **Demander à l'assistant** |
| **Se fixer un objectif** | « Ce que tu veux travailler » → **Proposer un objectif** → proposition en `AiBlock`, titre modifiable → **Adopter** | `POST /api/goals/proposal`, `POST /api/goals` | — |
| **Bilan de la semaine** | La dernière semaine achevée : progrès, décrochages, une action ; **Faire le bilan**, **Conserver** | `GET /api/goals/weekly`, `POST /api/goals/weekly`, `POST /api/goals/weekly/keep` | bouton seul |
| Bilans conservés | Les bilans gardés, à relire ou retirer | même appel | — |
| Objectifs passés | Atteint, partiel, abandonné | `GET /api/goals` | — |

## 2. Actions

| Action | Geste | Écrit | Garde |
|---|---|---|---|
| Proposer puis adopter | deux appuis séparés | `POST /api/goals` | rien n'est écrit avant « Adopter » |
| Clore / abandonner | armé puis exécuté | `POST /api/goals/{id}/close` · `abandon` | `If-Match` |
| Faire, conserver, retirer un bilan | boutons | `/api/goals/weekly…` | — |

## 3. Constats

- **Sans clé IA, l'écran n'a presque plus d'objet** : la proposition et le bilan passent
  par le modèle, et il n'existe aucun moyen de **saisir soi-même** un objectif chiffré.
  Le seul repli est la cible de poids de `/reglages`, que l'accueil montre faute de mieux.
- **Le bilan de la semaine regarde en arrière**, comme `/charge` et `/assiduite` ; il est
  rangé ici parce qu'il se juge contre l'objectif. Défendable — mais personne ne le
  cherche sous « Objectif » dans « Plus », où il est classé sous « Décider ».
- **Trois sens d'« objectif » dans l'application** : l'objectif daté (ici), les « Objectifs »
  de `/reglages` (cibles quotidiennes : poids, protéines, calories, eau, sucres) et la
  course A de `/plan`. L'accueil les mélange déjà : faute d'objectif, « Où je vais »
  affiche la cible de poids, et précise que ce n'en est pas un (M-13, M-19).

## 4. Non vu

Une proposition et un bilan réellement écrits (banc sans réponse de modèle).
