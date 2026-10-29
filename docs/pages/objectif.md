# Objectif — `/objectif`

**Rôle.** Un seul objectif chiffré, daté de quatre à huit semaines, proposé par le modèle
à partir des données et adopté à la main ; et le bilan de chaque semaine.

**Comment on y arrive.** « Plus » → Prévoir → Objectif ; « Détail » ou « Fixer un objectif »
dans le bloc « Où je vais » de l'accueil ; entrée de la barre du haut sur ordinateur.

Fichier : [`Goals.tsx`](../../frontend/src/routes/Goals.tsx).

---

## 1. Ce que l'écran montre

| Bloc | Ce qu'il montre | Source | Vide / erreur |
|---|---|---|---|
| **Objectif en cours** | Titre, anneau (ou « avancement indéterminé »), résumé chiffré, **ce que compte le pourcentage et depuis quelle base** (`ratio_text`), fenêtre d'observation, jours restants ; Clore / Abandonner (armé) | `GET /api/goals` | « Aucun objectif en cours » + **Demander à l'assistant** |
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
  cherche sous « Objectif » dans « Plus », où il est classé sous « Prévoir ».
- ~~**Trois sens d'« objectif » dans l'application.**~~ Corrigé (M-13, `21a1672`,
  `6f53740`) : « Objectif » ne désigne plus que l'objectif daté (ici). Les valeurs
  quotidiennes de `/reglages`, de `/nutrition`, de `/corps` et de la routine sont des
  « cibles » ; la course A de `/plan` est « la principale », en « priorité A ». ~~Reste que
  « Où je vais » affiche la cible de poids faute d'objectif~~ : depuis M-19 (`af2202d`), la
  course A passe avant, l'objectif daté dessous, et la cible de poids ne se montre qu'à
  défaut des deux.
- ~~**L'anneau dit « 0 % » sous « 2,2 sur 3 séances », et rien ne dit d'où il compte.**~~
  Dit (`a96f83a`, décision du 29 octobre) : la règle de `GOAL-04` ne change pas — le
  pourcentage est le chemin fait depuis la base relevée à l'adoption. Le serveur rédige la
  phrase (`GoalProgress.ratio_text`, `goals/progress.py`), l'écran l'affiche sous le
  résumé, ici et sur l'accueil. Elle dit la base selon la métrique : une cadence est une
  moyenne « par semaine » ou « par jour » sur la fenêtre d'avant l'adoption, le poids la
  dernière pesée au plus tard ce jour-là, datée quand elle est plus ancienne. Les cas
  limites :

  | Cas | Phrase |
  |---|---|
  | Au départ | « 0 % du chemin depuis ta base : 2,2 séances par semaine à l'adoption (moyenne des 4 semaines complètes d'avant). » |
  | À la baisse | « 50 % du chemin depuis ta base : 82 kg, dernier relevé avant l'adoption (24/09). » |
  | En recul | « 0 % … — en recul depuis, et le chemin ne se compte pas en négatif. » |
  | Cible dépassée | « 100 % … — cible dépassée. » (« cible atteinte » pile dessus) |
  | Base déjà sur la cible | « 100 % d'office : ta base, …, tenait déjà la cible — il n'y avait aucun chemin à compter. » |
  | Aucune base | « Chemin fait : — (aucun relevé au 29/09, jour de l'adoption, donc aucune base d'où le compter). Un relevé daté de ce jour-là ou d'avant en donnerait une. » |

  Deux effets de bord, voulus. Le texte que l'écran écrivait lui-même pour le cas sans base
  est parti : la phrase du serveur le remplace. Et `baseline` et `current` sont servis arrondis
  comme les phrases les citent (`core/text.shown`) : sur le banc, la tuile « Départ »
  disait 2,3 (`Intl` arrondit 2,25 vers le haut) sous une phrase qui disait 2,2 (`round`).
  Le condensé de l'assistant reprend la phrase mot pour mot. Le point du soir ne cite pas
  l'objectif : rien à y dire.
- **Cet écran-ci ne dit toujours rien de la course A.** M-19 l'a mise sur l'accueil, pas
  ici : `/objectif` reste celui de l'objectif chiffré. Voir `modifications.md` §7.

## 4. Non vu

Une proposition et un bilan réellement écrits (banc sans réponse de modèle).
