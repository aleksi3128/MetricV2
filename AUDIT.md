# Audit utilisateur de Metric — 17 octobre 2026

Audit mené en utilisateur, dans un navigateur, puis expliqué dans le code. **Aucune ligne de
code modifiée, aucun commit.** Captures dans [`audit/`](audit/) (112 fichiers).

**Banc d'essai.** La vraie API (`create_app`) sur un stockage WebDAV **en mémoire**
(`tests/fake_webdav.py`), jamais Nextcloud : variables `NEXTCLOUD_*` et `OPENROUTER_API_KEY`
forcées à vide, `.env` hors de portée. IA, Open Food Facts et Open-Meteo sur doublures. L'IA
est une doublure **pilotable** (réponse plausible selon la consigne, ou 429 / 500 / réponse
inexploitable / latence / clé absente) : **le vrai OpenRouter n'a jamais été appelé**. Horloge
du serveur décalable pour le passage de minuit. Front Vite (dev) et build de production
(`vite preview`, service worker actif) ; Chrome headless en CDP, **390 × 844** puis 1440 × 900,
plus 402, 360, 320 et paysage pour la barre basse. Les scripts du banc sont restés hors dépôt.

---

## 1. Synthèse

L'application est solide là où elle a été pensée en profondeur : dates au fuseau local (minuit
juste), garde `If-Match`, double appui absorbé, chiffres du tableau de bord exacts au CSV
près, pannes d'IA dites en français, PWA installable. Elle casse aux **jointures** : entre
deux écrans, entre ce que l'IA lit et ce que le formulaire envoie, entre une règle métier et
son implémentation.

Les trois problèmes les plus graves :
1. **Des pompes comptées en abdos** (`01`) : le groupe musculaire `abdos` est présélectionné
   en dur, et le premier appui après la saisie du nom est absorbé. Corruption silencieuse.
2. **Les compléments ne marchent pas de bout en bout** (`03`, `04`, `08`, `09`) : pas de
   heatmap pour un complément ajouté après le premier passage, une cadence ignorée par la
   checklist, et une cadence qu'on ne peut pas modifier.
3. **Des écrans qui mentent en panne** (`06`, `07`) : stockage injoignable, `/routine` affiche
   « Aucun supplément au planning » ; hors-ligne, la PWA renvoie à l'écran de connexion.

Impression honnête : on fait confiance aux chiffres du tableau de bord, mais pas à ce qui les
alimente. Le premier jour, on bute sur trois impasses (eau 0,9 L impossible, repas composé
sans catalogue, heatmap de complément introuvable).

---

## 2. Tableau récapitulatif

| ID | Sév. | Écran | Titre | Effort |
|---|---|---|---|---|
| 01 | 🔴 | /activite/seances | Groupe « abdos » présélectionné : exercices rangés dans le mauvais groupe sans le dire | S |
| 02 | 🔴 | /activite · import | La cadence SPM lue sur la capture est perdue à l'import | S |
| 03 | 🔴 | /routine → /assiduite | Un complément ajouté après le premier passage n'a jamais de heatmap ; la créer à la main exige un identifiant invisible | M |
| 04 | 🟠 | /routine, / | La checklist ignore la cadence : la whey « un jour sur deux » est due tous les jours | M |
| 05 | 🟠 | /assiduite, /, /routine | Eau validée à 1 500 ml (heatmap) et à 2 000 ml (ailleurs) — attendu > 1 L | S |
| 06 | 🟠 | /routine, carnet, /corps | Stockage injoignable : état vide affiché au lieu de l'erreur | S |
| 07 | 🟠 | PWA | Hors-ligne au lancement → écran de connexion, sans retour automatique | S |
| 08 | 🟠 | /routine | Cadence d'un complément non modifiable (route `PATCH` jamais appelée) | M |
| 09 | 🟠 | /routine | Cadence en texte libre : « 1 jour sur 2 » refusé sans dire pourquoi ; aucun cycle personnalisé | S |
| 10 | 🟠 | /nutrition | Repas composé : impasse avec un catalogue vide, textes qui promettent une saisie à la main disparue | S |
| 11 | 🟠 | toutes | Erreurs par champ en anglais brut (Pydantic) | M |
| 12 | 🟠 | /routine | Prise d'eau et complément supprimés en un seul appui | S |
| 13 | 🟠 | /activite | Séance muscu depuis notes libres ou photo : fonction absente | L |
| 14 | 🟡 | coquille mobile | Barre d'onglets de 63,2 px pour 56 px réservés : 7 px de contenu dessous | S |
| 15 | 🟡 | /nutrition | Estimation affichée mais non acceptée : abandonnée sans avertissement à l'enregistrement | S |
| 16 | 🟡 | /nutrition | IA lente : aucun retour, pas d'annulation, enregistrement bloqué | S |
| 17 | 🟡 | /activite/creer | Erreur IA en toast de ~3 s, avec un conseil hors contexte | S |
| 18 | 🟡 | /routine, ⊕ | Aucune saisie libre d'un volume d'eau | S |
| 19 | 🟡 | /routine, / | Moyennes d'hydratation diluées par les jours d'avant le premier usage | S |
| 20 | 🟡 | /assistant | Contexte de « ma semaine » : des zéros, et aucune ligne pour la semaine en cours | M |
| 21 | 🟡 | /corps | Deux pesées le même jour tracées comme une tendance ; libellé « 8 pesées » figé | S |
| 22 | 🟡 | /corps | « corriger / supprimer » hors écran dans le tableau des pesées | S |
| 23 | 🟡 | /activite · import | Option « Séance » toujours refusée ; durée en minutes décimales ; allure non affichée | S |
| 24 | 🟡 | /reglages | Un seul « Enregistrer » pour dix champs sur trois écrans | S |
| 25 | 🟡 | navigation | « Noter une séance » et « Créer une séance » coûtent un appui de trop | S |
| 26 | 🟡 | feuilles | Le retour navigateur quitte l'écran au lieu de fermer la feuille | M |
| 27 | 🟡 | ordinateur | Barre du haut tronquée à 1 440 px | S |
| 28 | 🟡 | /nutrition | Photo et photo + description retirées : 3 modes sur 4 attendus | — |
| 29 | 🟡 | accessibilité | Cellules de heatmap à 12 px, grille nutrition à 42 px | M |
| 30 | 🟡 | docs | `assistant-agent.md` liste des actions qui n'existent plus | S |
| 31 | ⚪ | /nutrition | Vignette grise vide sur chaque repas ; « kcal » renvoyé à la ligne | S |
| 32 | ⚪ | courbes | Étiquettes de valeur rendues à 9,3 px | S |
| 33 | ⚪ | divers | Libellés et alignements | S |

---

## 3. Fiches détaillées

### 01 🔴 Groupe « abdos » présélectionné : exercices rangés dans le mauvais groupe

**Catégorie** : données & calculs · UX

**Reproduction**
1. /activite → « Créer une séance » → « Créer une séance ».
2. Exercice 1 : taper « push up » (la liste de suggestions s'ouvre).
3. Appuyer sur la puce « pectoraux ».
4. Enregistrer, puis « Je l'ai faite » → « Consigner au journal ».

**Attendu** : aucun groupe présélectionné, l'enregistrement exigé tant que le groupe n'est pas
choisi ; la séance compte pour la piste Torse.
**Obtenu** : « abdos » est actif dès l'ouverture. Le premier appui sur « pectoraux » ne fait
que fermer les suggestions (état inchangé), le second fonctionne. Sans s'en apercevoir, on
enregistre `push up,abdos`. Le catalogue de l'utilisateur étant vide au premier usage,
choisir une suggestion ne corrige rien non plus.

**Preuve**
- [B28-suggestions-ouvertes.png](audit/B28-suggestions-ouvertes.png), [B29-groupes-etat.png](audit/B29-groupes-etat.png)
- état des puces relevé : `initial: … abdos:true` → `after tap pectoraux: … abdos:true` → second appui `pectoraux:true`
- `circuit_exercises.csv` : `e9bae223a982,1,push up,abdos,30,-1,10,`

**Cause racine** : `frontend/src/routes/activity/shared.ts:93-100` — `NEW_LINE.muscle_group:
'abdos'`. Le commentaire de `Circuits.tsx:341-344` dit pourtant « le groupe est exigé… le
deviner se tromperait en silence ». `onSelect` (`Circuits.tsx:331-338`) ne pose le groupe que si
l'exercice est déjà au catalogue **de l'utilisateur**.

**Piste** : `muscle_group: ''` par défaut, et l'enregistrement refusé (serveur) sans groupe.
Le même motif que `sets: '3'` cité dans CLAUDE.md §2.

---

### 02 🔴 La cadence SPM lue sur la capture est perdue à l'import

**Catégorie** : données & calculs · IA

**Reproduction**
1. /activite → « Importer une capture » → choisir une image → « Lire la capture ».
2. La lecture rend `cadence_spm: "168"` et `pace: "5'02\"/KM"`.
3. « Importer cette activité ».

**Attendu** : temps, allure, distance **et cadence SPM** écrits.
**Obtenu** : le formulaire n'affiche ni allure ni cadence ; `runs.csv` a `cadence_spm` vide.
L'allure enregistrée est recalculée (5,034) et non celle de la capture.

**Preuve**
- [B34-import-lu.png](audit/B34-import-lu.png)
- `runs.csv` : `2026-10-16,8.14,40.98,5.034,152,41,,,apple,…`

**Cause racine** : `frontend/src/routes/activity/AppleImport.tsx:242-265` — la charge utile
de `confirm` reprend distance, FC, D+, calories, bornes horaires et paliers, mais ni
`cadence_spm` ni `pace_min_km`, alors que le schéma serveur les accepte
(`backend/app/domains/imports/service.py:135`) et que `AppleDraft` les porte.

**Piste** : ajouter `cadence_spm: draft?.cadence_spm` (et l'allure lue) à la charge utile, comme
`total_calories`. Montrer la cadence dans le brouillon, marquée « proposée ».

---

### 03 🔴 Un complément ajouté après le premier passage n'a jamais de heatmap

**Catégorie** : fonctionnel

**Reproduction**
1. Premier lancement, ouvrir /assiduite ou /reglages (les pistes se créent).
2. /routine : ajouter « Whey », 30 g, « un jour sur deux ».
3. Revenir sur /assiduite.
4. Contournement : /reglages → « Ajouter une piste » → source « Prises d'un supplément ».

**Attendu** : une piste Whey avec sa cadence (« une par piste : … compléments »).
**Obtenu** : aucune piste Whey. Le formulaire manuel demande un champ « SUPPLÉMENT » en texte
libre, sans liste ; il attend l'**identifiant interne** (`8e11f8e26707`), jamais affiché.
Taper « Whey » donne une grille vide ; le laisser vide compte tous les compléments.

**Preuve**
- pistes après ajout : `torse dos bras jambes abdos course eau` — pas de Whey
- [B10-piste-supplement.png](audit/B10-piste-supplement.png)

**Cause racine**
- `backend/app/domains/heatmap/service.py:391-404` : `ensure_seeded` ne crée les pistes que si
  le fichier est vide ; les pistes de compléments (`:481-498`) ne naissent qu'à ce moment-là.
- `backend/app/domains/heatmap/sources.py:123-130` : le filtre est le `schedule_id`.

**Piste** : créer (ou réactiver) la piste `sup-<schedule_id>` à l'ajout d'un complément au
planning ; dans le formulaire, un sélecteur des compléments du planning à la place du champ
libre.

---

### 04 🟠 La checklist ignore la cadence d'un complément

**Catégorie** : données & calculs

**Reproduction**
1. Whey « un jour sur deux », cochée le 17/10.
2. Avancer l'horloge du serveur au 18/10 à 00:01.
3. Ouvrir / et /routine.

**Attendu** : le 18, rien n'est dû (la fenêtre de deux jours est tenue).
**Obtenu** : « Suppléments — / 1 prise · encore 1 prise » ; `complete: false`. Le
lendemain, la journée ne peut pas être complète sans une prise que la cadence ne demande pas.

**Preuve**
- [C08-dashboard-18-whey-due.png](audit/C08-dashboard-18-whey-due.png)
- `/api/supplements/today` le 18 : `"cadence_label":"un jour sur deux","taken":false … "planned":1`

**Cause racine** : `backend/app/domains/supplements/service.py:120-161` — `checklist` compte
tous les compléments actifs comme dus chaque jour ; la cadence ne sert qu'à l'étiquette
(`cadence_label`). La série (`_streaks`) compte des jours consécutifs, ce qui casse aussi tout
rythme « un jour sur deux ».

**Piste** : évaluer la cadence (`app.core.cadence`, déjà utilisée par la heatmap) pour décider
si un complément est dû ce jour-là ; ne compter dans `planned` que les dus.

---

### 05 🟠 Eau : validée à 1 500 ml sur la heatmap, 2 000 ml ailleurs — attendu > 1 L

**Catégorie** : données & calculs

**Reproduction**
1. Boire 0,9 L puis 1,1 L le 17/10 (puis 200 ml à 23:58 : 1,3 L).
2. Passer au 18/10, ouvrir /assiduite.

**Attendu** : le 17 validé (> 1 L).
**Obtenu** : 17/10 `"value":1300,"state":"missed"`. Le tableau de bord et /routine mesurent à
2 L (« encore 700 ml »). Trois seuils pour la même journée.

**Preuve**
- [C07-apres-minuit.png](audit/C07-apres-minuit.png), [B05-routine-1.1L.png](audit/B05-routine-1.1L.png)
- `/api/heatmap/eau` : `{"date":"2026-10-17","value":1300,"state":"missed"}`

**Cause racine** : `backend/app/domains/heatmap/service.py:64` — `WATER_VALIDATION = 1500.0`
codé à l'amorçage ; l'objectif quotidien vient du réglage `hydration_ml` (défaut 2 000).

**Piste** : amorcer la piste eau au seuil voulu (1 000 ml, validé si supérieur) et dire à l'écran
la différence entre « objectif » et « jour validé », ou les aligner.

---

### 06 🟠 Stockage injoignable : trois écrans affichent un état vide au lieu de l'erreur

**Catégorie** : fonctionnel · données

**Reproduction**
1. Couper le stockage (doublure WebDAV en panne), attendre 35 s (cache serveur de 30 s).
2. Ouvrir /routine, le carnet de l'assistant, /corps.

**Attendu** : « indisponible », comme le font /, /nutrition, /activite, /assiduite et /reglages.
**Obtenu**
- /routine : « Aucun supplément au planning — Ajoute ce que tu prends… », hydratation à « — »,
  aucun message d'erreur. Toutes les requêtes sont en `503`.
- carnet : « Carnet vide » alors qu'une note existe.
- /corps : « Pas encore de courbe — Deux pesées suffisent » avec deux pesées en base.

**Preuve**
- [C16-nc-down-routine-erreur.png](audit/C16-nc-down-routine-erreur.png), [C17-nc-down-assistant-ouvre-memoire.png](audit/C17-nc-down-assistant-ouvre-memoire.png), [C17-nc-down-corps.png](audit/C17-nc-down-corps.png)
- réseau : `503 /api/supplements/today`, `503 /api/hydration?days=30`, `503 /api/supplements/schedule`

**Cause racine** — l'état « erreur » oublié, celui que CLAUDE.md §4 décrit :
- `frontend/src/routes/Routine.tsx:187` (`{ data, isPending }`) et `:268-273` ; `:61` et `:317`
  lisent `data` seul ;
- `frontend/src/routes/Assistant.tsx:489` et `:547-556` (`data?.memories ?? []`) ;
- `frontend/src/routes/Body.tsx:480` (`series.length < 2` sans garde).

**Piste** : déstructurer `error` et rendre l'`Empty` d'erreur, comme `/nutrition` (« Journal
indisponible »).

---

### 07 🟠 Hors-ligne au lancement → écran de connexion

**Catégorie** : fonctionnel (PWA)

**Reproduction**
1. Build de production, ouvrir l'app (service worker actif, session valide).
2. Passer hors-ligne, recharger.
3. Repasser en ligne sans recharger.

**Attendu** : la coquille s'affiche et dit « hors-ligne » ; la session reste ouverte.
**Obtenu** : écran « Connexion ». Le jeton est toujours dans `localStorage`, mais l'app reste
sur /connexion une fois le réseau revenu. Il faut recharger à la main.

**Preuve**
- [D01b-hors-ligne-connexion.png](audit/D01b-hors-ligne-connexion.png), [D03-retour-en-ligne.png](audit/D03-retour-en-ligne.png)
- `token present? true path /connexion`

**Cause racine** : `frontend/src/app/AuthProvider.tsx:25-32` — tout échec de `/api/auth/me`
(réseau coupé, API qui redémarre) bascule en `anonymous`.

**Piste** : ne passer en `anonymous` que sur un `401` ; sur `NetworkError`, garder la session et
afficher un état hors-ligne qui réessaie au retour du réseau (`online`).

---

### 08 🟠 Cadence d'un complément non modifiable

**Catégorie** : fonctionnel

**Reproduction** : /routine → Planning → ligne « Whey · un jour sur deux ».
**Attendu** : modifier la cadence à tout moment.
**Obtenu** : la ligne n'a qu'un ✕. Le seul chemin est de supprimer puis recréer, ce qui change
le `schedule_id` et donc détache l'historique des prises.

**Preuve** : [B08-checklist-whey.png](audit/B08-checklist-whey.png)

**Cause racine** : `backend/app/domains/supplements/router.py:74` expose
`PATCH /schedule/{row_id}`, mais `frontend/src/features/routine/api.ts:118-124` ne propose que
`schedule`, `addSupplement` et `removeSupplement`. Aucun écran ne l'appelle.

**Piste** : un « Modifier » sur la ligne, sur le modèle de « Corriger » de /corps, qui `PATCH` la
fréquence ; la heatmap historise déjà le changement (`_sync_supplement_cadences`).

---

### 09 🟠 Cadence en texte libre : refus sans explication, aucun cycle personnalisé

**Catégorie** : UX · fonctionnel

**Reproduction** : /routine → Planning → Cadence « 1 jour sur 2 » → « Ajouter au planning ».
**Attendu** : la saisie comprise, ou une erreur sur le champ.
**Obtenu** : « Les données envoyées sont invalides. » en tête de carte, rien sous le champ. Le
serveur avait dit `cadence inconnue : « 1 jour sur 2 »`. Hors des cinq libellés exacts, aucun
cycle (« 1 jour sur 4 », « 2 fois par semaine ») n'est atteignable sans taper la forme
sérialisée (`window:min_count=1;window_days=4`).

**Preuve**
- [B06-whey-form.png](audit/B06-whey-form.png)
- `422 {"fields":[{"field":"body.frequency","message":"Value error, cadence inconnue : « 1 jour sur 2 »"}]}`

**Cause racine** : `frontend/src/routes/Routine.tsx:301-307` (cinq libellés en dur) et
`:450-460` (champ libre + `datalist`, la valeur brute part si elle ne correspond à aucun
libellé). Le formulaire n'affiche pas `messageFor('frequency')`.

**Piste** : remplacer le champ par le sélecteur de cadence de `routes/settings/Tracks.tsx`
(type + N + fenêtre), qui sait déjà sérialiser.

---

### 10 🟠 Repas composé : impasse avec un catalogue vide

**Catégorie** : UX · fonctionnel

**Reproduction** : premier lancement → /nutrition → « Ajouter un repas » → « Repas composé » →
« Ajouter un aliment » → chercher « blanc de poulet ».
**Attendu** : pouvoir ajouter un aliment sans code-barres.
**Obtenu** : « Ton catalogue est vide… d'ici là, le code-barres et la saisie à la main
suffisent. » Il n'y a aucun bouton de saisie à la main. Seule sortie : scanner, ou quitter pour
/nutrition/catalogue.

**Preuve** : [B19-ajouter-aliment.png](audit/B19-ajouter-aliment.png), [B20-recherche-aliment.png](audit/B20-recherche-aliment.png)

**Cause racine** : `frontend/src/routes/nutrition/PickStep.tsx:19-29` documente le retrait de la
saisie à la main ; les deux textes d'état vide (`:181-188`) n'ont pas suivi.

**Piste** : corriger les deux textes, et proposer un lien vers « Ajouter un aliment » du
catalogue depuis l'état vide.

---

### 11 🟠 Erreurs par champ en anglais brut

**Catégorie** : UX · charte

**Reproduction** : repas « Valeurs à la main », protéines `abc`, sucres `-5`, calories `999999`.
**Obtenu** : sous les champs, « Input should be a valid number, unable to parse string as a
number », « Input should be greater than or equal to 0 », « Input should be less than or equal to
10000 ». Même chose sur toutes les routes (pesée, eau, course).

**Preuve** : [C01-manuel-invalide.png](audit/C01-manuel-invalide.png) ; réponses API dans le
journal du banc (`body.weight_kg` → « Input should be greater than 0 »).

**Cause racine** : `backend/app/core/errors.py:95-100` recopie `error["msg"]` de Pydantic.

**Piste** : traduire par `error["type"]` (`greater_than`, `less_than_equal`, `float_parsing`…) avec
`ctx` pour la borne, côté serveur — le client affiche tel quel, comme le veut l'invariant.

---

### 12 🟠 Prise d'eau et complément supprimés en un seul appui

**Catégorie** : UX · données

**Reproduction** : /routine → ✕ sur une prise d'eau ; ✕ sur une ligne du planning.
**Attendu** : « Deux appuis pour détruire » (CLAUDE.md §3), comme les repas, les séances et le
carnet.
**Obtenu** : `DELETE` immédiat, aucune annulation. Le ✕ fait 44 × 44 au bord de la ligne.

**Preuve**
- [C05-eau-croix.png](audit/C05-eau-croix.png)
- `after ONE tap: [{"url":"/api/hydration/4","status":204,"method":"DELETE"}]`
- `after ONE tap: [{"url":"/api/supplements/schedule/1","status":204,"method":"DELETE"}]`

**Cause racine** : `frontend/src/routes/Routine.tsx:153-161` et `:384-393` — `onClick` appelle
directement la mutation.

**Piste** : réemployer `SwipeRow` ou le motif « supprimer → confirmer ? » de `/nutrition`.

---

### 13 🟠 Séance muscu depuis notes libres ou photo : fonction absente

**Catégorie** : fonctionnel (écart au besoin) · IA

**Reproduction** : chercher à journaliser « hier : pompes 4x15, tractions 3x8, squat 4x10 à
60 kg ».
**Attendu** : l'IA identifie les exercices, en déduit le groupe, enrichit et dédoublonne le
catalogue, pré-remplit l'écran.
**Obtenu** : rien ne lit une séance **faite**. « Composer avec l'assistant » propose un circuit
*à faire* ; l'assistant n'a que `circuit.create` ; aucune entrée photo. L'import de capture
refuse explicitement les séances de musculation.

**Preuve** : [B31-composer-reponse-vide.png](audit/B31-composer-reponse-vide.png) ;
`422 « Cette capture décrit une séance de musculation, et Metric ne les enregistre plus… »`

**Cause racine** : choix de la refonte (`docs/refonte-activite.md`) — tout passe par Cadence.
`backend/app/domains/assistant/actions.py:464-541` ne contient aucune action de séance faite.

**Piste** : décision produit d'abord. Techniquement, une route « analyser des notes » sur le
modèle de `nutrition/analyze`, qui rend un circuit consigné à valider.

---

### 14 🟡 Barre d'onglets plus haute que l'espace réservé

**Catégorie** : UX · charte (bug signalé)

**Reproduction** : n'importe quel écran à < 960 px, défiler jusqu'en bas.
**Obtenu** : barre de **63,2 px**, `main` réserve **56 px** → **7,2 px** de contenu restent
toujours dessous (`lastContentBottom 788 > barTop 781` à 390 × 844). Mesuré identique à 320,
360, 390 et en paysage.
**Bug signalé (« la barre rend des éléments inaccessibles »)** : **partiellement reproduit**.
Aucune cible n'a son centre masqué en émulation ; le recouvrement existe mais il est faible. Le
cas probable du signalement — clavier iOS ouvert, barre `fixed` sans gestion du clavier — n'est
pas reproductible en émulation (voir §6).

**Preuve** : [F01-barre-360x640.png](audit/F01-barre-360x640.png), [F01-barre-844x390.png](audit/F01-barre-844x390.png)

**Cause racine** : `frontend/src/app/TabBar.module.css:23-27` (`min-height: var(--tabbar)`
est un plancher, le bouton ⊕ et son libellé portent la barre à 63 px) contre
`frontend/src/app/Shell.module.css:143` (`padding-bottom: calc(var(--tabbar) + var(--safe-b))`).

**Piste** : faire de la hauteur réelle un token (ou mesurer la barre) et le réserver tel quel ;
masquer la barre quand un champ a le focus sur mobile.

---

### 15 🟡 Estimation non acceptée abandonnée sans avertissement

**Catégorie** : UX · IA

**Reproduction** : repas « Description » → « Estimer les macros » → la carte d'estimation
s'affiche → « Enregistrer le repas » sans « Utiliser ces valeurs ».
**Obtenu** : repas enregistré « macros non renseignées » (`,,,,manual`). L'estimation disparaît.
**Preuve** : [B15-nutrition-1repas.png](audit/B15-nutrition-1repas.png) ; `meals.csv` :
`2026-10-17T12:51:24…,déjeuner,pâtes au thon,,,,,manual,,`
**Cause racine** : `frontend/src/routes/nutrition/MealSheet.tsx:380-381` enregistre `values`
sans regarder l'estimation en attente — conforme à « une proposition n'est pas une mesure »,
mais sans le dire.
**Piste** : quand une estimation est en attente, l'enregistrement demande « avec ou sans
l'estimation ? ».

> Écarté : un premier essai où « Utiliser ces valeurs » semblait sans effet venait de mon pilote
> (appui pendant le défilement de la feuille). Rejoué proprement, le bouton fonctionne.

---

### 16 🟡 IA lente : aucun retour, pas d'annulation

**Catégorie** : UX · performance

**Reproduction** : latence IA à 25 s, « Estimer les macros ».
**Obtenu** : pendant 25,6 s, le bouton est seulement grisé (`aria-busy`), aucun texte, pas
d'annulation ; « Enregistrer le repas » est désactivé, même pour des valeurs tapées à la main.
**Preuve** : [C10-ia-lente-attente.png](audit/C10-ia-lente-attente.png)
**Piste** : texte d'attente (« lecture en cours… »), bouton « Annuler », et l'enregistrement
manuel laissé possible.

---

### 17 🟡 Erreur IA en toast de ~3 s, conseil hors contexte

**Catégorie** : UX · IA

**Reproduction** : /activite/creer → « Proposer une séance » avec un modèle qui ne rend rien.
**Obtenu** : l'écran reste « Rien de proposé pour l'instant ». Un toast « Les modèles
disponibles n'ont rien rendu d'exploitable. **Saisis les valeurs à la main**, ou réessaie. »
s'efface en moins de 4 s. Il n'y a pas de valeurs à saisir sur cet écran.
**Preuve** : [B32-composer-erreur.png](audit/B32-composer-erreur.png)
**Cause racine** : message unique `backend/app/domains/ai/service.py:214` et `:292`, rédigé
pour la nutrition.
**Piste** : message neutre côté serveur ; erreur posée dans la carte (pas en toast) sur cet écran.

---

### 18 🟡 Aucune saisie libre d'un volume d'eau

**Catégorie** : UX

**Reproduction** : vouloir noter 0,9 L.
**Obtenu** : seulement les raccourcis 250 / 500 / 750 (multiples de 250). Il faut aller régler
les raccourcis dans /reglages (« 200, 250, 500 »), en bas d'un formulaire de dix champs.
**Preuve** : [B01-noter-feuille.png](audit/B01-noter-feuille.png), [B03-reglages-raccourcis.png](audit/B03-reglages-raccourcis.png)
**Cause racine** : `frontend/src/app/QuickLog.tsx:119-160` et la carte Hydratation de
`Routine.tsx` n'offrent que `presets_ml` ; l'API accepte pourtant tout volume de 1 à 5 000 ml.
**Piste** : un `Stepper` « autre volume » sous les raccourcis.

---

### 19 🟡 Moyennes d'hydratation diluées par les jours d'avant le premier usage

**Catégorie** : données & calculs

**Obtenu** (premier jour, 1,1 L bus) : « moyenne 7 j : 157 ml », « moyenne 30 j : 37 ml »,
« objectif atteint 0 jour sur 30 ». Le jour en cours, incomplet, entre dans la moyenne.
**Preuve** : [B05-routine-1.1L.png](audit/B05-routine-1.1L.png) ;
`"average_7d_ml":157,"average_30d_ml":37,"days_reached":0,"days_counted":30`
**Cause racine** : `backend/app/domains/hydration/service.py:67-77` et `:107-111` — la série
est complétée à zéro sur toute la fenêtre (`:63`), jour courant compris.
**Piste** : commencer la fenêtre au premier relevé, exclure le jour en cours, rendre `null` en
dessous de deux jours — la règle « aucune valeur inventée ».

---

### 20 🟡 Contexte de l'assistant pour « ma semaine » : des zéros, pas de semaine en cours

**Catégorie** : IA · données

**Reproduction** : /assistant → « Comment se passe ma semaine ? » → « Ce qui a été envoyé ».
**Obtenu** : « Séances par semaine : 0 séances (moyenne des 4 dernières semaines complètes) »,
« Protéines : 0 g », « Hydratation : 0 ml (moyenne des 7 derniers jours révolus) » — pour des
périodes **sans aucune donnée**, présentées comme des mesures. Aucune ligne ne résume la
semaine en cours (2 séances, 8,1 km). Un vrai modèle peut répondre « tu n'as rien fait ».
**Preuve** : [B39-assistant-contexte.png](audit/B39-assistant-contexte.png)
**Cause racine (probable, non vérifiée ligne à ligne)** : formules de
`backend/app/domains/goals/progress.py:162-173`, réutilisées par le contexte, qui ne
distinguent pas « zéro » de « pas de donnée ».
**Piste** : « pas encore de données sur la période » au lieu de 0 ; ajouter une ligne « semaine
en cours ».

---

### 21 🟡 Deux pesées le même jour tracées comme une tendance

**Catégorie** : données & calculs

**Reproduction** : /corps → 78,4 puis 78,6 le même jour.
**Obtenu** : acceptées sans avertissement ; la courbe trace « 17/10/2026 → 17/10/2026 », « +0,2 kg
en hausse » ; l'en-tête dit « VARIATION · 8 PESÉES » avec deux pesées.
**Preuve** : [E01-courbe-poids-meme-jour.png](audit/E01-courbe-poids-meme-jour.png) ;
`weight.csv` : deux lignes `2026-10-17`
**Cause racine** : `frontend/src/routes/Body.tsx:435` (libellé en dur) ; pas de règle « une
pesée par jour » côté `body/service.py`.
**Piste** : proposer de remplacer la pesée du jour ; libellé calculé par le serveur.

---

### 22 🟡 « corriger / supprimer » hors écran dans le tableau des pesées

**Catégorie** : UX · accessibilité

**Obtenu** à 390 px : le tableau fait 495 px dans 340 ; « corriger » commence à x = 345 et
« supprimer » est entièrement hors champ. Défilement horizontal dans la carte, sans indice.
**Preuve** : [E01-courbe-poids-meme-jour.png](audit/E01-courbe-poids-meme-jour.png) ;
`_tableWrap sw=495 cw=340`
**Piste** : lignes en `SwipeRow` sur mobile, ou colonnes Note/Source masquées sous 600 px.

---

### 23 🟡 Import : « Séance » toujours refusée, durée en minutes décimales

**Catégorie** : UX

**Obtenu** : le sélecteur propose « Course | Séance » ; « Séance » est toujours refusée au moment
d'importer. La durée « 0:40:59 » devient « 40,98 » min. L'allure lue n'est pas montrée.
**Preuve** : [B34-import-lu.png](audit/B34-import-lu.png) ;
`422 « …Metric ne les enregistre plus. Crée une séance Cadence… »`
**Cause racine** : `frontend/src/routes/activity/AppleImport.tsx:485-494`.
**Piste** : retirer l'option ; afficher la durée en `mm:ss`.

---

### 24 🟡 Un seul « Enregistrer » pour dix champs

**Catégorie** : UX

**Obtenu** : modifier « Raccourcis d'hydratation » n'enregistre rien tant qu'on n'a pas trouvé le
bouton, sous la carte « Zones d'intensité », deux écrans plus bas. Quitter la page perd la saisie
sans prévenir.
**Preuve** : [B03-reglages-raccourcis.png](audit/B03-reglages-raccourcis.png)
**Cause racine** : `frontend/src/routes/Settings.tsx:435-520`, un `<form>` unique.
**Piste** : un enregistrement par carte, ou une barre d'enregistrement collante dès qu'un champ
change.

---

### 25 🟡 Un appui de trop pour « Noter » / « Créer » une séance

**Catégorie** : UX

**Obtenu** : ⊕ → « Noter une séance » ouvre le haut de /activite (aucune séance à noter).
« Créer une séance » de /activite ouvre /activite/seances, où il faut retaper « Créer une
séance ».
**Preuve** : [B21-noter-seance.png](audit/B21-noter-seance.png), [B22-creer-seance.png](audit/B22-creer-seance.png)
**Piste** : liens directs vers le formulaire ouvert (`/activite/seances?creer`).

---

### 26 🟡 Le retour navigateur quitte l'écran au lieu de fermer la feuille

**Catégorie** : UX (Android surtout)

**Obtenu** : feuille « Ajouter un repas » ouverte sur /nutrition, `history.back()` → retour à /.
Le brouillon survit (15 min en `localStorage`) mais la feuille ne se rouvre pas d'elle-même.
**Piste** : pousser une entrée d'historique à l'ouverture d'une `Sheet` et fermer sur `popstate`.

---

### 27 🟡 Barre du haut tronquée à 1 440 px

**Catégorie** : UX · charte

**Obtenu** : « ASSIDUI… » coupé, « RÉGLAGES » hors champ derrière le dégradé ; l'Assistant n'y est
pas (choix documenté).
**Preuve** : [G01-desk-accueil.png](audit/G01-desk-accueil.png)
**Cause racine** : `frontend/src/app/Shell.module.css:67-78` (`overflow-x: auto` + `mask-image`)
sur une barre bornée par la largeur de lecture.
**Piste** : regrouper Corps / Planning / Objectif / Assiduité dans un menu « Plus » sur ordinateur
aussi.

---

### 28 🟡 Trois modes de saisie d'un repas sur quatre attendus

**Catégorie** : fonctionnel (écart au besoin)

**Obtenu** : Description · Repas composé · Valeurs à la main. Ni « photo » ni « photo +
description ». Retrait **délibéré et documenté** (`docs/saisie-repas-v2.md` §2, `NUT-22`) ;
la route d'analyse photo existe toujours côté serveur. À reconfirmer face au besoin exprimé.
**Preuve** : [B11-repas-modes.png](audit/B11-repas-modes.png)

---

### 29 🟡 Cibles sous le plancher de 44 px

**Catégorie** : accessibilité

**Obtenu** : chaque cellule de heatmap est un bouton de **12 × 12** (2 597 cibles sur
/assiduite) ; la grille calories de /nutrition, **42 × 42**.
**Piste** : la cellule n'est pas une cible ; un appui sur une semaine ou une colonne, ou une
loupe au toucher.

---

### 30 🟡 La doc de l'assistant liste des actions qui n'existent plus

**Catégorie** : documentation

`docs/assistant-agent.md:147-156` annonce `workout.add`, `set.add`, `exercise.create` ;
`backend/app/domains/assistant/actions.py:464-541` n'a que `circuit.create` côté activité.

---

### 31 ⚪ Vignette grise vide sur chaque repas ; « kcal » à la ligne

Reliquat de la photo retirée : un carré gris vide à gauche de chaque repas. « 640 / kcal » sur deux
lignes. [C03-journal.png](audit/C03-journal.png)

### 32 ⚪ Étiquettes de valeur des courbes à 9,3 px

`audit-mobile.mjs` : « SVG : 20 px déclarés → 9.3 px rendus » sur /, /corps (étiquettes 78,4 / 78,6
de la courbe de poids), sous le plancher de 12 px. Les étiquettes d'axe ont été corrigées
(`Chart.module.css`), pas celles-ci.

### 33 ⚪ Libellés et alignements

- « Annuler » porte une icône de coche ([B26-je-lai-faite.png](audit/B26-je-lai-faite.png)).
- « Whey pris, aucun restant(s) » dans le contexte de l'assistant.
- Champ cadence tronqué « un jour sur » ([B08-checklist-whey.png](audit/B08-checklist-whey.png)).
- « Modifier » sous le texte pour Course, à droite pour Eau ([B09-ajouter-piste.png](audit/B09-ajouter-piste.png)).
- Pizza saisie à 1,5 g de protéines affichée « 2 g prot. » au journal.

---

## 4. Frictions UX — hésitations sans bug

- **Trois chiffres pour l'eau** : 2 L sur l'accueil, 1,5 L sur la heatmap, et rien à l'écran pour
  dire lequel « valide » la journée.
- **La heatmap du premier jour est vide** : les cellules d'avant la création des pistes ne sont pas
  dessinées. Le texte dit « le gris y domine », or il n'y a pas de gris.
- **Noms d'exercices en anglais** (catalogue Cadence) : « pompes » ne trouve rien ; l'indice le dit,
  mais on tape d'abord en français.
- **Formulaire de séance pré-rempli** (4 rounds, 60 s, 30 s, 10 s) : un gabarit plutôt qu'une
  mesure, mais on ne sait pas si ces valeurs « comptent ».
- **Adresse de Cadence obligatoire** pour qu'une séance s'ouvre ; le bandeau « en sommeil » apparaît
  avant même d'avoir créé quoi que ce soit.
- **Badge « ai »** (minuscules, ton `load`) sur un repas *validé* : se lit comme une alerte.
- **Badge orange « au rythme hebdomadaire »** sur une semaine réussie.
- **La date de séance** n'est pas modifiable au moment de « Consigner » (séance d'hier impossible
  sans passer par le CSV) — non vérifié en profondeur.

---

## 5. Ce qui marche bien — à ne pas casser

- **Minuit** : 23:58 au 17, 00:01 au 18, écran mis à jour sans rechargement.
- **Tableau de bord exact** : 1,3 L, 48 g, 1 / 1 complément, 47 min, 8,1 km — vérifiés au CSV.
- **`If-Match`** : absent → 409, faux → 409, message en français.
- **Double appui** absorbé (pesée, repas) ; suppression de repas, de séance et oubli d'une note en
  deux appuis.
- **Pannes d'IA** (429, 500, réponse inexploitable, description illisible, clé absente) toutes dites
  en français ; sans clé, le mode Description disparaît proprement.
- **Valeur proposée** bien marquée (`AiBlock`, pointillés) ; rien n'est écrit sans validation.
- **Brouillon de repas** conservé au rechargement.
- **Virgule décimale** (`78,4`, `1,5`) acceptée partout où testée.
- **Validation serveur** : négatifs, zéro, futurs, valeurs énormes refusés.
- **Focus clavier** visible sur toutes les cibles parcourues ; aucun champ < 16 px ; aucun
  défilement horizontal de page.
- **PWA** : manifest sans erreur, installable, worker actif ; `/api` jamais servi du cache client.
- **Aucune exception JavaScript** sur toute la session.

---

## 6. Non testé

| Quoi | Pourquoi |
|---|---|
| Qualité réelle de l'IA (photo floue, notes ambiguës, variantes d'exercice) | Vrai OpenRouter non appelé (règle : accord préalable). Seule la *tuyauterie* est testée |
| Clavier iOS par-dessus la barre basse, zone sûre de 34 px | Ni émulable en CDP ni testé sur un vrai téléphone ; c'est la piste la plus probable du bug signalé |
| Nextcloud réel : verrous, 429 avec `Retry-After`, conflit entre deux appareils | Doublure WebDAV seulement ; conflit simulé à l'API (`If-Match` faux), pas entre deux écrans |
| Scan de code-barres | Pas de caméra en headless |
| Import `.fit`, page Course, story | Hors du parcours demandé |
| `/planning`, `/objectif`, rappels push | Parcourus vides seulement ; pas de clés VAPID |
| `/activite/charges` (règle « hors kg → vide, poids du corps → 0 ») | Lu dans le code, pas testé à l'écran : le poids du corps est un drapeau `bodyweight` avec `weight_kg` vide, pas 0 (`activity/models.py:320`) |
| Contraste mesuré | Repris de `styles/tokens.test.ts` ; écarts connus `--ink-low` 3,4:1 et badge `recover` 4,2:1 non remesurés |
| Lecteur d'écran | Non testé |
| Performance sur un historique de plusieurs années | Données d'une journée seulement |
