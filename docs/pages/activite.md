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
| `/activite/charges` | Poids des exercices | [`activity/Loads.tsx`](../../frontend/src/routes/activity/Loads.tsx) |
| `/activite/courses` | Toutes tes courses | [`activity/Runs.tsx`](../../frontend/src/routes/activity/Runs.tsx) |
| `/activite/natations` | Toutes tes natations | [`activity/Swims.tsx`](../../frontend/src/routes/activity/Swims.tsx) |
| `/activite/course` et `/activite/course/:id` | Une course (la dernière, ou une précise) | [`activity/Run.tsx`](../../frontend/src/routes/activity/Run.tsx), [`activity/run/`](../../frontend/src/routes/activity/run/) |

---

## 1. `/activite` — Courses & séances

| Bloc | Ce qu'il montre | Source | Vide / erreur |
|---|---|---|---|
| En-tête | Liens Courses, Natation, Poids des exercices (sur une seconde rangée à 402 px) | — | — |
| **Séances Cadence** | Les trois premières séances : nom, durée (≈ si répétitions), rounds, exercices ; **Ouvrir dans Cadence**, **Je l'ai faite** | `GET /api/activity/circuits` | « Aucune séance » ; liens **Créer une séance**, **Composer avec l'assistant** |
| **Sortie** | Deux boutons : Enregistrer une course, Enregistrer une natation | — | — |
| **Historique** | Toutes les activités fusionnées (course, séance, natation, vélo/marche) : date, libellé, distance, durée, allure ; puces détail / corriger / noter l'effort | `GET /api/activity` | « Aucune activité » ; erreur dite |

### Actions

| Action | Geste | Écrit | Garde |
|---|---|---|---|
| Déclarer une séance faite | Je l'ai faite → durée proposée → Consigner au journal | `POST /api/activity/circuits/{id}/done` | addition |
| Enregistrer une course | feuille en deux étapes (`NewActivitySheet`) : `.fit`, capture, ou à la main ; puis « Une douleur ? », après toute course écrite (session 10 b, `ab4b27a`) | `POST /api/activity/runs/fit` · `POST /api/import/apple/analyze` puis `POST /api/import/apple` (capture, qui sert `run_id`) · `POST /api/activity/runs` (main) · `POST /api/pain` ou `/api/pain/none` | addition |
| ~~Saisir un vélo ou une marche~~ | ~~même feuille, troisième choix de l'étape 1 (M-16)~~ : **retiré de l'écran le 29 octobre** (`11bdd17`) ; la route reste, `git revert 11bdd17` rétablit l'entrée | `POST /api/activity/others` (sans écran) | addition |
| Enregistrer une natation | feuille (`SwimEntrySheet`) : `.fit` ou notation | `POST /api/activity/swims/fit` · `POST /api/activity/swims` | addition |
| Corriger une course | puce « corriger » → `ActivitySheet` | `PATCH /api/activity/runs/{id}` | `If-Match` |
| Noter l'effort d'un vélo / marche | puce → `OtherSheet` | `PUT /api/activity/others/{id}/rpe` | `If-Match` |
| Corriger un vélo / marche | puce → `OtherSheet` → « Corriger la sortie » : le formulaire de la saisie, pré-rempli, en place (sport, date, durée, distance, effort — session 10 b, `d5bc4ac`) | `GET /api/activity/others` (la ligne, les sports) · `PATCH /api/activity/others/{id}` | `If-Match` ; un conflit passe en toast et le formulaire remonte sur la ligne relue |
| Supprimer une activité | glissement, deux appuis (`SwipeRow`) | `DELETE` course, natation, autre ou séance (+ ses séries) | `If-Match`, deux appuis |

## 2. `/activite/seances` — Séances Cadence

| Bloc | Ce qu'il montre | Source |
|---|---|---|
| Adresse de Cadence absente | « Adresse de Cadence non renseignée », le champ et **Enregistrer** sur place (M-04 ; c'était « Aller aux réglages ») | `GET /api/activity/circuits` (`linkable`), `GET /api/settings` |
| Formulaire (à la demande) | Nom, rounds, repos ; par exercice : nom (recherche au catalogue Cadence), groupe musculaire, durée ou répétitions, repos, note | `GET /api/activity/muscle-groups`, `GET /api/activity/circuits/exercises` |
| Liste | Chaque séance : Ouvrir dans Cadence, Je l'ai faite, Corriger, Supprimer | — |
| Coller un lien Cadence | Adresse → **Relire ce lien** | `POST /api/activity/circuits/import` |
| Adresse de Cadence réglée | Ligne de pied « Adresse de Cadence », l'adresse, **Modifier** (M-04) | `GET /api/settings` |

Écrit : `POST/PATCH/DELETE /api/activity/circuits` (`If-Match`, deux appuis pour supprimer) ;
l'adresse, `PATCH /api/settings` (sa seule clé, jeton partagé de `settings.csv`, la chaîne
vide l'efface).

## 3. `/activite/creer` — Composer une séance

Une phrase (« bras 30 min, un haltère de 10 kg ») → **Proposer une séance** (modèle) →
proposition en `AiBlock`, chaque valeur en `Stepper` `proposed`, ajustable → **Enregistrer
la séance**. Écrit : `POST /api/activity/circuits/propose` (rien) puis
`POST /api/activity/circuits`.

## 4. `/activite/charges` — Poids des exercices

Recherche d'exercice ; trois groupes : **À renseigner**, **Chargés**, **Poids du corps** ;
une quatrième, **Plus dans aucune séance** (orphelines, seules supprimables). Pas-à-pas
local, **Enregistrer** écrit. Feuille par exercice : historique du poids, 30 derniers
jours de séances. Source : `GET /api/activity/loads`, `GET /api/activity/loads/detail`.
Écrit : `POST/PATCH/DELETE /api/activity/loads`.

## 5. `/activite/courses` — Toutes tes courses

| Bloc | Ce qu'il montre | Source |
|---|---|---|
| Tuiles | Sorties, distance, temps, allure totale | `GET /api/activity/runs/progress` |
| À réanalyser | Nombre de sorties d'avant l'analyse actuelle + **Réanalyser** | même appel ; `POST /api/activity/runs/efforts/rebuild` |
| **Charge de course (FC)** (`Trends`) | Charge 7 jours (minutes pondérées par zone FC), moyenne hebdo sur 4 semaines, rapport ; facile / modéré / dur sur 14 jours, **constat seul** (M-02), en entiers qui font 100 et aux teintes de `/charge` (`98b0ac8`) ; dernière séance dure ; lien « Charge tous sports » vers `/charge` ; charge par semaine | `GET /api/activity/runs/trends` |
| Ce qui va avec tes bonnes sorties | Facteurs corrélés à l'efficacité, ceux en attente repliés | même appel |
| Tes records | Meilleur temps par distance (400 m → 10 km), lien vers la sortie | progress |
| Progression | Meilleur X de chaque sortie, courbe, choix de la distance | progress |
| Volume par semaine | km et sorties par semaine | progress |
| Liste | Toutes les courses : date (★ meilleure allure, badge `.fit`), distance, allure | progress |
| **Repères** (M-04) | Carte repliée « Zones d'intensité » : badge saisis / déduits, FC max, allure seuil, **Enregistrer**. Rendue dans tous les états de la page ; `/activite/courses#reperes` l'ouvre et y descend | `GET /api/settings` ; écrit `PATCH /api/settings` (ses deux clés) |

Action : **Ajouter une course** (même feuille que `/activite`).

## 6. `/activite/natations` — Toutes tes natations

Quatre dernières semaines (mètres, séances ; tiret pour une semaine sans bassin) ; un lien
de pied **Les sigles de nage** → `/planning/sigles` (M-04) ; liste des séances (saisie / `.fit`, distance, durée, allure /100 m, tours douteux). Un appui
ouvre `SwimSheet` : programme ou tours, effort perçu, **Corriger la séance**, **Supprimer
cette natation**. Source : `GET /api/activity/swims`, `GET /api/activity/swims/{swim_id}`.

## 7. `/activite/course/:id` — Une course

Haut d'écran rempli : 4 749 px.

| Bloc | Ce qu'il montre | Source |
|---|---|---|
| Tuiles | Distance, temps (+ pause), allure (+ en mouvement), cadence, cardio, dénivelé, puissance | `GET /api/activity/runs/{id}` ; analyse |
| Séance prévue | Le respect bloc par bloc de la séance planifiée ce jour-là | `GET /api/activity/runs/{id}/adherence` |
| Conditions | **Effort perçu 1–10**, et ce que la sortie pèse dans la charge globale — mesurée, « estimée depuis la FC », ou ce qu'il manque (M-02, point 4) ; météo au départ ; « Le matin » (FC de repos, VFC) ; autour de la sortie (Cadence dans les 48 h, poids du jour) | `GET /api/activity/runs/{id}/conditions` (`global_load_text`) |
| Faire une story | Feuille : image 1080 × 1920 à fond transparent | lecture du `.fit` |
| Ce qu'il faut retenir | Constats rédigés par le serveur | `GET /api/activity/runs/{id}/analysis` |
| Allure et parcours | Courbe liée au tracé, FC ou cadence en superposition | analyse |
| **Et maintenant** | La carte du coach née de cette sortie | `GET /api/coach/next` |
| Intensité | Zones d'allure et temps passé ; « Corriger les repères » / « Saisir un repère sur la page des courses » → `/activite/courses#reperes` (M-04) | analyse |
| Foulée, Selon ta montre | Mesures de foulée ; effets aérobie/anaérobie, charge, VO2max… (Garmin) | analyse |
| Meilleurs efforts | Temps les plus courts de la sortie | analyse |
| Kilomètre par kilomètre | Paliers, cadence par km | `GET /api/activity/runs/{id}/splits` |
| Parmi tes N courses | Rang d'allure, rang de distance | même appel |
| Fichier | **Récupérer le fichier .fit** | — |

Sans `.fit` : une carte « Sortie sans fichier .fit » remplace l'analyse.

## 8. Les feuilles

| Feuille | Ouverte depuis | Contenu |
|---|---|---|
| `NewActivitySheet` « Course » | Enregistrer une course, Ajouter une course | Étape 1 : `.fit` (un vélo y est reconnu et réaiguillé ; une natation s'ouvre dans `SwimSheet`, sur place — M-15), capture (si IA, une seule), ou « Saisir une course à la main » (« Vélo ou marche, à la main », M-16, a quitté la feuille le 29 octobre — `11bdd17`). Étape 2 : date, temps, distance, allure, cadence, FC, ressenti ; après une capture, en plus, ce qu'elle a lu et ce qui manquait, dénivelé et calories, paliers et doublon probable, écrits par l'import (`source=apple`, M-14). Après un `.fit` : effort perçu et `PainCheck` ; après une course saisie ou relue d'une capture : `PainCheck` (session 10 b) |
| `ActivitySheet` | corriger | Date, distance, durée, FC, ressenti |
| `SwimEntrySheet` | Enregistrer une natation, Corriger la séance | `.fit` ou date, heure, durée, bassin, programme en notation (clavier de sigles), note |
| `SwimSheet` | une natation | voir §6 |
| `OtherSheet` | vélo / marche | effort perçu, et « Corriger la sortie » : `OtherEntry` pré-rempli, en place (session 10 b) |
| `StorySheet` | Faire une story | encre, tracé, bouts masqués, **Partager l'image** |
| Feuille d'une charge | un exercice | §4 |

## 9. Constats

- ~~**Deux charges, deux règles du « facile ».**~~ Corrigé (M-02, `385871a`, `1fa151b`) :
  la page Courses ne juge plus sa répartition sur 14 jours, elle la constate ; la seule
  cible est celle de `/charge`, 80 % sur 28 jours
  ([`training/intensity.py`](../../backend/app/domains/training/intensity.py)). Le coach
  garde un plancher à lui, 70 % en course sur 14 jours
  ([`coach/frame.py`](../../backend/app/domains/coach/frame.py), `EASY_SHARE_FLOOR`). La
  section s'appelle « Charge de course (FC) » et renvoie à `/charge`. ~~**Reste** le
  point 4~~ : fait le 29 octobre (session 10 c, `22a53dd`) — une course avec FC sans effort perçu
  entre dans la charge globale par sa charge FC convertie, dite « estimée depuis la FC » sur
  sa page et sur `/charge`, dès cinq courses notées avec FC ; l'effort noté la remplace
  ([`charge-multisport.md`](../charge-multisport.md) §7). La page Courses n'a pas changé :
  elle montre la charge de course, pas la globale.
- ~~**Trois portes vers la capture Apple.**~~ Corrigé (M-14, `ded7779`) : la carte
  « Import d'une capture » est partie, après que l'étape 1 de la feuille a repris tout ce
  qu'elle écrivait — dénivelé, calories, heures, paliers, `source=apple` —, qu'elle lisait
  puis jetait. Seul l'envoi de plusieurs captures à la fois n'a pas suivi.
- ~~**Une natation `.fit` déposée dans « Enregistrer une course » part au planning.**~~
  Corrigé (M-15, `9f1e991`) : elle s'ouvre dans `SwimSheet`, sur place, depuis `/activite`
  comme depuis `/activite/courses` ; la note le dit.
- ~~**Vélo et marche ne s'ajoutent que par un `.fit`.**~~ Corrigé (M-16, `2cc88e0`,
  `7eaa41f`) : troisième choix de la feuille « Course », l'effort perçu dans le même
  formulaire, les sports servis par le serveur. ~~Une sortie saisie ne se corrige toujours
  pas — elle se note, ou se supprime.~~ Elle se corrige (`d5bc4ac`, session 10 b). **Puis
  la saisie a quitté l'écran**, par décision du 29 octobre (`11bdd17`) : vélo et marche
  n'entrent de nouveau que par un `.fit`. La route, le formulaire (qui sert à la
  correction) et ce qui est déjà écrit restent ; `git revert 11bdd17` rétablit l'entrée.
- ~~**Une course saisie à la main ne demande pas la douleur.**~~ Corrigé (session 10 b,
  `ab4b27a`) : `PainCheck` en fin de feuille, comme après un `.fit`, rattaché par `run_id` —
  que l'import d'une capture sert désormais. L'effort perçu, lui, n'est pas redemandé
  après une course à la main (§7 de `modifications.md`).
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
