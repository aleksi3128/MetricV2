# Planning — `/planning`

**Rôle.** Le calendrier des séances : ce qui est prévu, ce qui a été fait, et ce que les
coachs proposent d'y mettre.

**Comment on y arrive.** « Plus » → Prévoir → Planning ; la ligne de la séance prévue sur
l'accueil ; entrée de la barre du haut sur ordinateur ; après un import de natation `.fit`
(`/planning?jour=…`).

Fichiers : [`Planning.tsx`](../../frontend/src/routes/Planning.tsx),
[`planning/`](../../frontend/src/routes/planning/) — `MonthGrid`, `DayPanel`, `PlanSheet`,
`RunBuilder`, `SwimSheet`, `Subscription`, `AgendaCard`, `Changes` (`PlanningChat` est parti
avec M-20) ; et la sous-page du glossaire, `SwimGlossary` et `SwimCodes` (M-04).

---

## 1. Ce que l'écran montre

Haut d'écran rempli : 2 316 px à l'inventaire ; 3 175 depuis M-03, sur le banc du 26 octobre
(2 366 avant), avec l'agenda relié et deux changements du coach ; 2 969 après M-04, l'agenda
replié, sur le banc de M-04 (2 987 avant sur ce banc, qui n'a qu'un changement) — voir le
`README`. **2 307** après M-20 (2 766 avant, sur le banc de M-20 : trois séances prévues et un
fil du planning qui a déjà une proposition adoptée) ; vide, 2 562 → 2 331.

| Bloc | Ce qu'il montre | Source | Vide / erreur |
|---|---|---|---|
| Respect du planning | Séances honorées / prévues sur N semaines, taux | `GET /api/planning/adherence` | tiret sans séance prévue |
| **Mois** | Grille du mois, ←, Aujourd'hui, → ; pastilles prévu / fait / natation | `GET /api/planning/month` | « Planning indisponible » |
| **Le jour choisi** | Séances prévues (Modifier, supprimer) ; « Effectué » : ce qui a été fait ce jour-là, natations avec leurs tours ; **Planifier** ; import `.fit` de natation | même appel | « Rien ce jour-là » |
| **Ce que le coach a changé** (M-03) | Les déplacements et allègements faits par le coach, chacun avec sa raison ; **Oui** / **Non, remets comme avant** | `GET /api/planning/changes` | carte absente |
| **Séance proposée par le coach** | La carte du coach de course (la même que le matin et que la page d'une course) | `GET /api/coach/next` | « Pas de séance proposée » + **Demander une proposition** |
| **Demander au planning** (M-20) | Une phrase et **Ouvrir le fil du planning**, qui mène à `/assistant?portee=planning` : le fil vit dans l'assistant, avec ses suggestions et ses propositions | — (aucune lecture ici) | — |
| **Agenda** (M-03) | Le lien public de l'agenda iCloud : état (relié, injoignable, non relié), créneaux occupés cette semaine. Reliée, la carte se replie sur son état et **Modifier** (M-04), qui déplie **Relier l'agenda**, **Oublier le lien** (deux appuis) et **Replier** | `GET /api/planning/agenda` | « non relié » et la phrase qui dit à quoi il sert ; la panne dite |
| **Abonnement calendrier** | Lien ICS à s'abonner ; à défaut **Télécharger le planning une fois** | `GET /api/planning/subscription` | phrase de configuration (`ICAL_SECRET`) |
| Pied | Lien **Les sigles de nage** → `/planning/sigles` (M-04), hors des états du mois | — | — |

## 1 bis. `/planning/sigles` — le glossaire de nage

Sous-page sans entrée de navigation (M-04), atteinte par le pied de `/planning` et de
`/activite/natations` ; **Retour au planning**. Le glossaire de la notation, venu de
`/reglages` : nages, allures, matériel et exercices ; renommer et rétablir un sigle de base,
ajouter, corriger ou retirer (deux appuis) un sigle ajouté. Source
`GET /api/planning/swim/codes` ; écrit `POST/PATCH/DELETE /api/planning/swim/codes`. Aucun
lien depuis les feuilles de saisie, qui portent le glossaire en lecture, replié : les quitter
ferait perdre la séance en cours d'écriture. Haut d'écran : 2 326 px.

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
| Demander au planning | lien vers l'assistant (M-20) | — ici ; les propositions s'adoptent dans le fil | appui par séance, dans le fil du planning |
| Accepter / refuser la séance du coach | carte | `POST /api/coach/next/accept` · `refuse` | — |
| Fichier pour la montre | carte | `GET /api/coach/next/workout.fit` | lecture |
| Défaire un changement du coach | « Non, remets comme avant » | `POST /api/planning/changes/{key}` | — (refusé en toutes lettres si la séance a été retouchée) |
| Relier / oublier l'agenda | Modifier, champ | `PATCH /api/planning/agenda` | oublier : deux appuis (M-04) |

## 4. Liens sortants

`/planning/sigles` (pied, M-04) ; `/assistant?portee=planning` (« Ouvrir le fil du planning »,
M-20) ; l'export ICS.

## 5. Constats

- ~~**Deux façons de demander une séance sur la même page.** « Demander au planning » (un
  fil d'assistant, centré sur la natation par ses trois suggestions) et « Séance proposée
  par le coach » (le coach de course, à règles et modèle). Le mot est tranché (M-13,
  `c2f44fa` : « coach » ne désigne plus que le coach de course) ; les deux restent deux
  portes vers « propose-moi une séance » (M-20).~~ Corrigé (M-20, `bbacdd7`) : la carte du
  coach reste seule ; le fil est passé dans l'assistant, et `/planning` n'en garde qu'une
  entrée. Après une adoption, « Voir au planning » ramène sur le premier jour écrit.
- ~~**L'agenda iCloud n'est pas ici.**~~ Corrigé (M-03, `c9b1433`) : la carte Agenda est
  sur `/planning`, juste avant l'abonnement calendrier, son pendant sortant.
- ~~**« Ce que le coach a changé » n'est pas ici non plus.**~~ Corrigé (M-03, `c9b1433`) :
  la carte suit le jour choisi, absente quand le coach n'a rien changé ; le point du soir
  garde la sienne, même composant.
- ~~**Le glossaire de la notation de nage est dans `/reglages`.**~~ Corrigé (M-04,
  `58ba44b`) : `/planning/sigles`, au pied de cette page et de celle des natations.
- **Une séance du plan de course apparaît ici** après « Poser au planning » sur `/plan`,
  sans rien qui dise d'où elle vient sur la grille.

## 6. Non vu

Une proposition d'un vrai modèle dans le fil du planning (celles du banc de M-20 sont
écrites à la main) ; un abonnement configuré. L'agenda relié a
été vu le 26 octobre, par une doublure de `fetch_text` (aucun appel à iCloud).
