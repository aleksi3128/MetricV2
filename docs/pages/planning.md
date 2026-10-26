# Planning — `/planning`

**Rôle.** Le calendrier des séances : ce qui est prévu, ce qui a été fait, et ce que les
coachs proposent d'y mettre.

**Comment on y arrive.** « Plus » → Décider → Planning ; la ligne de la séance prévue sur
l'accueil ; entrée de la barre du haut sur ordinateur ; après un import de natation `.fit`
(`/planning?jour=…`).

Fichiers : [`Planning.tsx`](../../frontend/src/routes/Planning.tsx),
[`planning/`](../../frontend/src/routes/planning/) — `MonthGrid`, `DayPanel`, `PlanSheet`,
`RunBuilder`, `SwimSheet`, `PlanningChat`, `Subscription`, `AgendaCard`, `Changes`.

---

## 1. Ce que l'écran montre

Haut d'écran rempli : 2 316 px à l'inventaire ; 3 175 depuis M-03, sur le banc du 26 octobre
(2 366 avant), avec l'agenda relié et deux changements du coach — voir le `README`.

| Bloc | Ce qu'il montre | Source | Vide / erreur |
|---|---|---|---|
| Respect du planning | Séances honorées / prévues sur N semaines, taux | `GET /api/planning/adherence` | tiret sans séance prévue |
| **Mois** | Grille du mois, ←, Aujourd'hui, → ; pastilles prévu / fait / natation | `GET /api/planning/month` | « Planning indisponible » |
| **Le jour choisi** | Séances prévues (Modifier, supprimer) ; « Effectué » : ce qui a été fait ce jour-là, natations avec leurs tours ; **Planifier** ; import `.fit` de natation | même appel | « Rien ce jour-là » |
| **Ce que le coach a changé** (M-03) | Les déplacements et allègements faits par le coach, chacun avec sa raison ; **Oui** / **Non, remets comme avant** | `GET /api/planning/changes` | carte absente |
| **Séance proposée par le coach** | La carte du coach de course (la même que le matin et que la page d'une course) | `GET /api/coach/next` | « Pas de séance proposée » + **Demander une proposition** |
| **Le coach du planning** | Un fil d'assistant dédié, trois suggestions (« Ma semaine de natation », « Une séance technique », « Ajuste à ce que j'ai nagé »), champ de demande ; propositions à adopter une par une | `GET /api/assistant/threads/planning`, `POST /api/assistant/chat/stream` | « Assistance indisponible » |
| **Agenda** (M-03) | Le lien public de l'agenda iCloud : état (relié, injoignable, non relié), créneaux occupés cette semaine, **Relier l'agenda**, **Oublier le lien** | `GET /api/planning/agenda` | « non relié » et la phrase qui dit à quoi il sert |
| **Abonnement calendrier** | Lien ICS à s'abonner ; à défaut **Télécharger le planning une fois** | `GET /api/planning/subscription` | phrase de configuration (`ICAL_SECRET`) |

## 2. La feuille « Planifier une séance »

Nature (natation, muscu, course, autre), date, heure, titre, durée, note. Une **course**
s'écrit dans la notation lue par le serveur (`RunBuilder`, modèles de séance, aide du
coach) ; une **natation** dans la notation `400 CR EF`. Avertissements avant d'écrire
(`POST /api/planning/check`). Écrit : `POST/PATCH/DELETE /api/planning/sessions`.

## 3. Actions

| Action | Geste | Écrit | Garde |
|---|---|---|---|
| Planifier, modifier une séance | feuille | `POST/PATCH /api/planning/sessions` | `If-Match` à la modification |
| Retirer une séance | deux appuis | `DELETE /api/planning/sessions/{id}` | `If-Match` |
| Importer une natation `.fit` | panneau du jour | `POST /api/activity/swims/fit` | addition |
| Demander au coach du planning | fil | propositions, adoptées une par une | appui par séance |
| Accepter / refuser la séance du coach | carte | `POST /api/coach/next/accept` · `refuse` | — |
| Fichier pour la montre | carte | `GET /api/coach/next/workout.fit` | lecture |
| Défaire un changement du coach | « Non, remets comme avant » | `POST /api/planning/changes/{key}` | — (refusé en toutes lettres si la séance a été retouchée) |
| Relier / oublier l'agenda | champ | `PATCH /api/planning/agenda` | — |

## 4. Liens sortants

Aucun lien d'écran ; l'export ICS.

## 5. Constats

- **Deux coachs sur la même page, qui ne se connaissent pas.** « Le coach du planning »
  (un fil d'assistant, centré sur la natation par ses trois suggestions) et « Séance
  proposée par le coach » (le coach de course, à règles et modèle). Deux vocabulaires pour
  « propose-moi une séance » (M-20).
- ~~**L'agenda iCloud n'est pas ici.**~~ Corrigé (M-03, `c9b1433`) : la carte Agenda est
  sur `/planning`, juste avant l'abonnement calendrier, son pendant sortant.
- ~~**« Ce que le coach a changé » n'est pas ici non plus.**~~ Corrigé (M-03, `c9b1433`) :
  la carte suit le jour choisi, absente quand le coach n'a rien changé ; le point du soir
  garde la sienne, même composant.
- **Le glossaire de la notation de nage est dans `/reglages`** (« Natation »), loin de la
  feuille qui s'en sert (M-04).
- **Une séance du plan de course apparaît ici** après « Poser au planning » sur `/plan`,
  sans rien qui dise d'où elle vient sur la grille.

## 6. Non vu

Une proposition réelle du coach du planning ; un abonnement configuré. L'agenda relié a
été vu le 26 octobre, par une doublure de `fetch_text` (aucun appel à iCloud).
