# Activité — `/activite` et ses sous-pages

**Rôle.** Tout ce qui se fait en sport : lancer une séance Cadence et la déclarer faite,
enregistrer une course ou une natation, relire l'historique, analyser une sortie, noter
les charges des exercices.

**Comment on y arrive.** Onglet « Activité » ; « Noter une séance » dans la feuille
« Noter » (→ `/activite/seances`) ; liens « détail » de l'historique et des records.

La destination la plus large de l'application : **sept adresses** et sept feuilles.

| Adresse | Écran | Fichier |
|---|---|---|
| `/activite` | Courses & séances | [`Activity.tsx`](../../frontend/src/routes/Activity.tsx) |
| `/activite/seances` | Séances Cadence | [`activity/Circuits.tsx`](../../frontend/src/routes/activity/Circuits.tsx) |
| `/activite/creer` | Composer une séance (IA) | [`activity/Compose.tsx`](../../frontend/src/routes/activity/Compose.tsx) |
| `/activite/charges` | Charges des exercices | [`activity/Loads.tsx`](../../frontend/src/routes/activity/Loads.tsx) |
| `/activite/courses` | Toutes tes courses | [`activity/Runs.tsx`](../../frontend/src/routes/activity/Runs.tsx) |
| `/activite/natations` | Toutes tes natations | [`activity/Swims.tsx`](../../frontend/src/routes/activity/Swims.tsx) |
| `/activite/course` et `/activite/course/:id` | Une course (la dernière, ou une précise) | [`activity/Run.tsx`](../../frontend/src/routes/activity/Run.tsx), [`activity/run/`](../../frontend/src/routes/activity/run/) |

---

## 1. `/activite` — Courses & séances

| Bloc | Ce qu'il montre | Source | Vide / erreur |
|---|---|---|---|
| En-tête | Liens Courses, Natation, Charges | — | — |
| **Séances Cadence** | Les trois premières séances : nom, durée (≈ si répétitions), rounds, exercices ; **Ouvrir dans Cadence**, **Je l'ai faite** | `GET /api/activity/circuits` | « Aucune séance » ; liens **Créer une séance**, **Composer avec l'assistant** |
| **Sortie** | Deux boutons : Enregistrer une course, Enregistrer une natation | — | — |
| **Historique** | Toutes les activités fusionnées (course, séance, natation, vélo/marche) : date, libellé, distance, durée, allure ; puces détail / corriger / noter l'effort | `GET /api/activity` | « Aucune activité » ; erreur dite |

### Actions

| Action | Geste | Écrit | Garde |
|---|---|---|---|
| Déclarer une séance faite | Je l'ai faite → durée proposée → Consigner au journal | `POST /api/activity/circuits/{id}/done` | addition |
| Enregistrer une course | feuille en deux étapes (`NewActivitySheet`) : `.fit`, capture, ou à la main | `POST /api/activity/runs/fit` · `POST /api/import/apple/analyze` puis `POST /api/import/apple` (capture) · `POST /api/activity/runs` (main) | addition |
| Enregistrer une natation | feuille (`SwimEntrySheet`) : `.fit` ou notation | `POST /api/activity/swims/fit` · `POST /api/activity/swims` | addition |
| Corriger une course | puce « corriger » → `ActivitySheet` | `PATCH /api/activity/runs/{id}` | `If-Match` |
| Noter l'effort d'un vélo / marche | puce → `OtherSheet` | `PUT /api/activity/others/{id}/rpe` | `If-Match` |
| Supprimer une activité | glissement, deux appuis (`SwipeRow`) | `DELETE` course, natation, autre ou séance (+ ses séries) | `If-Match`, deux appuis |

## 2. `/activite/seances` — Séances Cadence

| Bloc | Ce qu'il montre | Source |
|---|---|---|
| Adresse de Cadence absente | « Adresse de Cadence non renseignée » + **Aller aux réglages** | `GET /api/activity/circuits` (`linkable`) |
| Formulaire (à la demande) | Nom, rounds, repos ; par exercice : nom (recherche au catalogue Cadence), groupe musculaire, durée ou répétitions, repos, note | `GET /api/activity/muscle-groups`, `GET /api/activity/circuits/exercises` |
| Liste | Chaque séance : Ouvrir dans Cadence, Je l'ai faite, Corriger, Supprimer | — |
| Coller un lien Cadence | Adresse → **Relire ce lien** | `POST /api/activity/circuits/import` |

Écrit : `POST/PATCH/DELETE /api/activity/circuits` (`If-Match`, deux appuis pour supprimer).

## 3. `/activite/creer` — Composer une séance

Une phrase (« bras 30 min, un haltère de 10 kg ») → **Proposer une séance** (modèle) →
proposition en `AiBlock`, chaque valeur en `Stepper` `proposed`, ajustable → **Enregistrer
la séance**. Écrit : `POST /api/activity/circuits/propose` (rien) puis
`POST /api/activity/circuits`.

## 4. `/activite/charges` — Charges

Recherche d'exercice ; trois groupes : **À renseigner**, **Chargés**, **Poids du corps** ;
une quatrième, **Plus dans aucune séance** (orphelines, seules supprimables). Pas-à-pas
local, **Enregistrer** écrit. Feuille par exercice : historique de la charge, 30 derniers
jours de séances. Source : `GET /api/activity/loads`, `GET /api/activity/loads/detail`.
Écrit : `POST/PATCH/DELETE /api/activity/loads`.

## 5. `/activite/courses` — Toutes tes courses

| Bloc | Ce qu'il montre | Source |
|---|---|---|
| Tuiles | Sorties, distance, temps, allure totale | `GET /api/activity/runs/progress` |
| À réanalyser | Nombre de sorties d'avant l'analyse actuelle + **Réanalyser** | même appel ; `POST /api/activity/runs/efforts/rebuild` |
| **Charge de course (FC)** (`Trends`) | Charge 7 jours (minutes pondérées par zone FC), moyenne hebdo sur 4 semaines, rapport ; facile / modéré / dur sur 14 jours, **constat seul** (M-02) ; dernière séance dure ; lien « Charge tous sports » vers `/charge` ; charge par semaine | `GET /api/activity/runs/trends` |
| Ce qui va avec tes bonnes sorties | Facteurs corrélés à l'efficacité, ceux en attente repliés | même appel |
| Tes records | Meilleur temps par distance (400 m → 10 km), lien vers la sortie | progress |
| Progression | Meilleur X de chaque sortie, courbe, choix de la distance | progress |
| Volume par semaine | km et sorties par semaine | progress |
| Liste | Toutes les courses : date (★ meilleure allure, badge `.fit`), distance, allure | progress |

Action : **Ajouter une course** (même feuille que `/activite`).

## 6. `/activite/natations` — Toutes tes natations

Quatre dernières semaines (mètres, séances ; tiret pour une semaine sans bassin) ; liste
des séances (saisie / `.fit`, distance, durée, allure /100 m, tours douteux). Un appui
ouvre `SwimSheet` : programme ou tours, effort perçu, **Corriger la séance**, **Supprimer
cette natation**. Source : `GET /api/activity/swims`, `GET /api/activity/swims/{swim_id}`.

## 7. `/activite/course/:id` — Une course

Haut d'écran rempli : 4 749 px.

| Bloc | Ce qu'il montre | Source |
|---|---|---|
| Tuiles | Distance, temps (+ pause), allure (+ en mouvement), cadence, cardio, dénivelé, puissance | `GET /api/activity/runs/{id}` ; analyse |
| Séance prévue | Le respect bloc par bloc de la séance planifiée ce jour-là | `GET /api/activity/runs/{id}/adherence` |
| Conditions | **Effort perçu 1–10** ; météo au départ ; « Le matin » (FC de repos, VFC) ; autour de la sortie (Cadence dans les 48 h, poids du jour) | `GET /api/activity/runs/{id}/conditions` |
| Faire une story | Feuille : image 1080 × 1920 à fond transparent | lecture du `.fit` |
| Ce qu'il faut retenir | Constats rédigés par le serveur | `GET /api/activity/runs/{id}/analysis` |
| Allure et parcours | Courbe liée au tracé, FC ou cadence en superposition | analyse |
| **Et maintenant** | La carte du coach née de cette sortie | `GET /api/coach/next` |
| Intensité | Zones d'allure et temps passé ; lien vers les réglages | analyse |
| Foulée, Selon ta montre | Mesures de foulée ; effets aérobie/anaérobie, charge, VO2max… (Garmin) | analyse |
| Meilleurs efforts | Temps les plus courts de la sortie | analyse |
| Kilomètre par kilomètre | Paliers, cadence par km | `GET /api/activity/runs/{id}/splits` |
| Parmi tes N courses | Rang d'allure, rang de distance | même appel |
| Fichier | **Récupérer le fichier .fit** | — |

Sans `.fit` : une carte « Sortie sans fichier .fit » remplace l'analyse.

## 8. Les feuilles

| Feuille | Ouverte depuis | Contenu |
|---|---|---|
| `NewActivitySheet` « Course » | Enregistrer une course, Ajouter une course | Étape 1 : `.fit` (un vélo y est reconnu et réaiguillé ; une natation s'ouvre dans `SwimSheet`, sur place — M-15), capture (si IA, une seule), ou à la main. Étape 2 : date, temps, distance, allure, cadence, FC, ressenti ; après une capture, en plus, ce qu'elle a lu et ce qui manquait, dénivelé et calories, paliers et doublon probable, écrits par l'import (`source=apple`, M-14). Après un `.fit` : effort perçu et `PainCheck` |
| `ActivitySheet` | corriger | Date, distance, durée, FC, ressenti |
| `SwimEntrySheet` | Enregistrer une natation, Corriger la séance | `.fit` ou date, heure, durée, bassin, programme en notation (clavier de sigles), note |
| `SwimSheet` | une natation | voir §6 |
| `OtherSheet` | vélo / marche | effort perçu seul |
| `StorySheet` | Faire une story | encre, tracé, bouts masqués, **Partager l'image** |
| Feuille d'une charge | un exercice | §4 |

## 9. Constats

- ~~**Deux charges, deux règles du « facile ».**~~ Corrigé (M-02, `385871a`, `1fa151b`) :
  la page Courses ne juge plus sa répartition sur 14 jours, elle la constate ; la seule
  cible est celle de `/charge`, 80 % sur 28 jours
  ([`training/intensity.py`](../../backend/app/domains/training/intensity.py)). Le coach
  garde un plancher à lui, 70 % en course sur 14 jours
  ([`coach/frame.py`](../../backend/app/domains/coach/frame.py), `EASY_SHARE_FLOOR`). La
  section s'appelle « Charge de course (FC) » et renvoie à `/charge`. **Reste** le
  point 4 : une course sans effort perçu n'a toujours pas de charge globale.
- ~~**Trois portes vers la capture Apple.**~~ Corrigé (M-14, `ded7779`) : la carte
  « Import d'une capture » est partie, après que l'étape 1 de la feuille a repris tout ce
  qu'elle écrivait — dénivelé, calories, heures, paliers, `source=apple` —, qu'elle lisait
  puis jetait. Seul l'envoi de plusieurs captures à la fois n'a pas suivi.
- ~~**Une natation `.fit` déposée dans « Enregistrer une course » part au planning.**~~
  Corrigé (M-15, `9f1e991`) : elle s'ouvre dans `SwimSheet`, sur place, depuis `/activite`
  comme depuis `/activite/courses` ; la note le dit.
- **Vélo et marche ne s'ajoutent que par un `.fit`.** `activityApi.createOther` existe et
  le serveur accepte `POST /api/activity/others`, mais aucun écran ne l'appelle (M-16).
- ~~**La date du jour s'affiche en ISO** au pied de l'étape 1.~~ Corrigé (M-21,
  `3bcde3f`) : « Aujourd'hui : jeudi 22 octobre ».
- ~~**L'état vide de `/activite/courses` renvoie ailleurs.**~~ Corrigé (M-21, `3bcde3f`) :
  il nomme le bouton « Ajouter une course » de la page. Ceux de `/activite/course`
  disent toujours « depuis l'activité », et c'est juste : cette page n'a pas de bouton
  d'ajout.
- **L'effort perçu se demande à six endroits** (page de la course, feuille de natation,
  `OtherSheet`, après un import, matin, soir). Ce n'est pas un défaut : c'est la même
  écriture, posée là où l'on est. Mais une séance Cadence n'en reçoit qu'au point du soir —
  « Je l'ai faite » ne demande que la durée — et c'est l'effort perçu qui fait entrer une
  séance dans la charge globale.
- **La correction d'une course est plus courte que sa saisie** : ni cadence ni effort perçu
  dans `ActivitySheet`, qui les a pourtant à l'étape 2 de la saisie.
- **L'écran le plus long de l'application est une course** : 4 749 px, quatorze blocs. La
  carte du coach y arrive au septième.

## 10. Non vu

Une capture réellement lue par un modèle ; une proposition du coach écrite par un modèle
(le banc tombe sur la règle) ; les champs Garmin masqués (`garmin.CONFIRMED` vide) ; le
respect d'une séance prévue (aucune séance planifiée le jour d'une course du banc).
