# Plan de course — `/plan`

**Rôle.** Les courses qu'on vise (A, B, C), leurs conflits, et le plan périodisé jusqu'à
la prochaine course A, à poser au planning d'un geste.

**Comment on y arrive.** « Plus » → Prévoir → Plan de course ; entrée « Plan » de la barre
du haut sur ordinateur. Depuis M-19, le bloc « Où je vais » de l'accueil y mène : **Détail**,
**Poser le plan** ou **Voir le plan**, selon l'état du plan posé.

Fichier : [`Plan.tsx`](../../frontend/src/routes/Plan.tsx).

---

## 1. Ce que l'écran montre

Haut d'écran rempli : 2 287 px à l'inventaire ; 1 955 depuis M-03, sur le banc du 26 octobre
(2 839 avant) — voir le `README`.

| Bloc | Ce qu'il montre | Source | Vide / erreur |
|---|---|---|---|
| Conflit (s'il y en a) | « Deux courses visées en A » et la phrase qui tranche ; **Oui, fais-le** / non | `GET /api/races` | — |
| Plan qui ne suit plus (s'il y en a) | La phrase du serveur (« Le plan posé au planning mène au 16/02 ; … ») et **Reposer le plan** (M-17) | même appel, `stale_plan` | — |
| **Courses visées** | Nom, date, distance, priorité, chrono visé ; **corriger** (M-17), supprimer ; **Ajouter une course visée** (formulaire en place, ses distances servies — `distances`, depuis `catalog.SPECS`, `ed46495`) | même appel | « Aucune course visée » |
| ~~**Ce que le coach a changé**~~ | Parti sur `/planning` (M-03, `c9b1433`) | — | — |
| **Plan jusqu'à la course A** | Synthèse (semaines, volume de départ et de pic, affûtage), avertissement de préparation courte ; les quatre semaines qui viennent, séance par séance en notation ; les autres repliées ; **Poser au planning** | `GET /api/races/plan/{race_id}` | « Plan indisponible » |
| ~~**Agenda**~~ | Parti sur `/planning` (M-03, `c9b1433`) | — | — |

## 2. Actions

| Action | Geste | Écrit | Garde |
|---|---|---|---|
| Ajouter une course visée | formulaire | `POST /api/races` | addition |
| Corriger une course visée | « corriger » sur la ligne : le formulaire d'ajout, pré-rempli, en place (M-17) | `PATCH /api/races/{id}` | `If-Match` ; un conflit passe en toast et recharge |
| Reposer un plan qui ne suit plus | bandeau « Le plan posé ne suit plus » (`stale_plan`), **armé** | `POST /api/races/plan/{race_id}` | deux appuis |
| Supprimer une course visée | deux appuis | `DELETE /api/races/{id}` | `If-Match` |
| Trancher un conflit | Oui / non | `POST /api/races/conflicts/{key}` | — |
| Poser le plan | bouton ; **armé** s'il remplace un plan déjà posé | `POST /api/races/plan/{race_id}` · `DELETE /api/races/plan` | deux appuis au remplacement |

## 3. Constats

- ~~**Une course visée ne se corrige pas.**~~ Corrigé (M-17, `defb1cd`) : « corriger »
  sur chaque ligne, le formulaire d'ajout en place, sous `If-Match`. Une date déplacée au
  plan posé fait dire au serveur que le plan ne suit plus ; le bandeau le repose, armé.
  Seule la date le déclenche — une course A passée en B garde son plan sans rien dire.
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
- ~~**Le plan et l'objectif ne se parlent pas à l'écran.**~~ Corrigé sur l'accueil (M-19,
  `af2202d`) : « Où je vais » montre la course A, son « J-n » et la phase du plan posé, et
  dit quand le plan ne suit plus — sans bouton de repose, qui reste ici, armé. `/objectif`
  n'en dit toujours rien.

## 4. Non vu

Un conflit A/A. ~~Un plan déjà posé puis remplacé~~ : vu le 27 octobre sur le banc, par
le bandeau de M-17 — 48 séances posées, la date avancée de deux semaines, 54 reposées.
