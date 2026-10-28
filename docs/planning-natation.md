# Le planning nage — la natation planifiée, sa notation, et le fil de l'assistant

`/planning` sait prévoir une course, une séance de muscu, ou « autre ». Ce lot y fait entrer
la **natation**, écrite dans la notation des entraîneurs — `8×100 CR EA PB R20` — et pose
sous la grille un **fil de l'assistant** qui ne parle que cette langue-là. Il ferme la
boucle avec le réalisé : le `.fit` de la montre en piscine, refusé jusqu'ici en toutes
lettres, devient lisible et se réécrit dans la même notation, à côté de ce qui était prévu.

Les décisions ci-dessous ont été prises une à une le 18 octobre 2026, et la partie import
repose sur un fichier réel décodé avant d'écrire (§6). **Le lot est livré** le même jour ;
le §9 dit ce qui a dévié du plan en route, et pourquoi.

---

## 1. Les décisions arrêtées

| # | Question | Décision | Ce qu'elle coûte |
|---|---|---|---|
| D1 | La natation, à côté ou à la place ? | **Quatrième nature**, avec `course`, `muscu`, `autre` | Une valeur de plus dans `KINDS` ; `plan.csv` reste compatible |
| D2 | Comment s'écrit une séance ? | **Texte noté, lu par le serveur** — une ligne par bloc | Un analyseur côté backend ; aucune donnée nouvelle à structurer |
| D3 | La syntaxe d'un bloc | **Ordre fixe** : `[N×]distance NAGE [ALLURE] [OPTIONS…] [R… \| D…]` | Stricte, et c'est ce qui rend le refus possible |
| D4 | Le glossaire | **Modifiable en Réglages**, sur une base livrée | Un fichier de plus, et une règle de suppression (D5) |
| D5 | Supprimer un sigle employé | **Refusé tant qu'il sert** ; les sigles de base ne se suppriment jamais | Un balayage de `plan.csv` à chaque suppression |
| D6 | La durée d'une séance nage | **Saisie à la main**, comme aujourd'hui | Rien. Le serveur calcule une distance, jamais un temps |
| D7 | Le chat sous la grille | **L'assistant existant**, dans un **fil dédié** | L'extraction du fil hors de `Assistant.tsx` (§5.4) |
| D8 | Quand le chat planifie | **Il propose, tu adoptes** — `AiBlock`, retrait séance par séance | Un appui de plus ; une semaine fausse ne s'écrit pas sur un malentendu |
| D9 | Un sigle hors glossaire dans une réponse | **Refusé et relancé une fois**, puis séance écartée et dite | Une passe de modèle de plus, parfois |
| D10 | La carte « Proposer un planning » | **Remplacée par le fil** ; la route `/propose` reste | Un seul chemin vers l'IA sur la page |
| D11 | Le réalisé natation | **Import du `.fit` piscine** | Un sous-domaine sur le patron de la course (§6) |
| D12 | Les longueurs douteuses | **Signalées, pas corrigées** | La distance de la montre reste affichée, fausse de ~75 m sur le fichier d'exemple |
| D13 | La nage détectée | **Un indice, corrigeable au tour** — les « brasse puis crawl » du fichier étaient du crawl | Une colonne de correction, et un appui par tour à corriger |
| D14 | Où vit une nage réalisée | **`activity/swims.csv` + `activity/swim_laps.csv`**, `.fit` archivé | Deux fichiers, sur le modèle exact des courses |
| D15 | Plan contre réalisé | **Le réalisé réécrit en notation, côte à côte** ; une natation prévue n'est honorée que par une natation | La règle d'honneur de `PLAN-06` change pour ce sport seulement |

---

## 2. La notation

### 2.1 La grammaire

Un programme est une suite de lignes. Chaque ligne est **un titre de section** ou **un
bloc** ; il n'y a pas de troisième sorte, et c'est ce qui permet de refuser le reste.

```
section := texte libre terminé par « : »                  Échauffement :
bloc    := [N×] distance NAGE [ALLURE] [OPTION…] [récup]   8×100 CR EA PB R20
         | N×( bloc ; bloc … ) [récup]                     2×(4×25 CR SP R20 ; 100 DOS RC) R1'
récup   := R<durée> | D<durée>                             R15 · R1' · R1'30 · D1'30
durée   := secondes | minutes' | minutes'secondes
```

- **La distance** est en mètres, entière, **multiple de 25**, de 25 à 2 000. Un bassin de
  50 m reste couvert ; un « 30 » est une faute de frappe, pas un exercice.
- **Une seule nage** par bloc, obligatoire. **Une allure** au plus. **Des options** en
  nombre, sans doublon — matériel et exercices (`PB`, `PL`, `JB`, `ÉD`…).
- **Une récupération** au plus, toujours en dernier : `R` = repos après le bloc, `D` =
  départ toutes les… Les deux à la fois sont refusés : ils disent la même chose de deux
  façons contradictoires.
- **Un seul niveau de parenthèses.** `2×(4×(…))` existe dans les carnets d'entraîneur ; il
  attendra un vrai besoin.

`R`, `D` et `×` sont **de la syntaxe**, pas du glossaire : ils ne se modifient pas en
Réglages, et aucun sigle ne peut commencer par `R` ou `D` suivi d'un chiffre (D5).

### 2.2 Ce qui est toléré, et ce qui ne l'est pas

Un clavier de téléphone n'a pas de `×`, et iOS transforme `'` en `’` sans le dire. Refuser
ces deux-là reviendrait à refuser tout ce qui se tape au pouce. Sont donc **lus comme
équivalents** :

| Saisi | Lu |
|---|---|
| `x`, `X`, `*` | `×` |
| `’`, `′`, `´` | `'` |
| `cr`, `Cr` | `CR` — la casse n'est pas un autre sigle |
| `ED` | `ÉD` — l'accent non plus |

C'est de la **typographie**, pas de la traduction. Un synonyme (`NL` pour `CR`) n'est pas
corrigé : c'est la décision D9, et une table de synonymes apprendrait au modèle que la
notation est négociable.

### 2.3 Ce que le serveur en tire

`planning/swim.py`, module **pur** — ni fichier ni horloge, comme `conversation.py` : chaque
cas se vérifie sur une chaîne fixe.

- la **distance totale**, répétitions et parenthèses déroulées ;
- la **ventilation par nage** et **par allure**, en mètres ;
- le **repos cumulé** des seuls `R`. Un `D` ne donne pas de repos sans connaître l'allure
  nagée, et l'estimer serait une valeur inventée ;
- en cas de faute, **chaque ligne fautive** avec son numéro, le jeton et la raison, en
  français : « ligne 3 : « NL » n'est pas dans le glossaire ». Code `swim_notation_invalid`.

Le client ne lit pas une notation. Il affiche ce que le serveur a lu.

```
Échauffement :
  400 CR EF
  4×50 CR ÉD R15
Corps :
  8×100 CR EA PB R20
  2×(4×25 CR SP R30) R1'
Retour au calme :
  200 DOS RC
                           → 2 200 m · CR 2 000 · DOS 200 · repos 6'20
```

### 2.4 Le glossaire de base

| Catégorie | Sigles |
|---|---|
| Nages | `CR` crawl · `DOS` dos · `BR` brasse · `PAP` papillon · `4N` quatre nages |
| Allures | `EF` endurance fondamentale · `EA` endurance active · `SL` seuil · `VMA` vitesse maximale aérobie · `SP` sprint · `RC` récupération |
| Options — matériel | `PB` pull-buoy · `PL` plaquettes · `PM` palmes · `PLA` planche · `TU` tuba |
| Options — exercices | `JB` jambes seules · `BRS` bras seuls · `ÉD` éducatifs · `RAT` rattrapé |

---

## 3. Le glossaire en Réglages

`planning/swim_codes.csv` : `id · code · label · category · source`.

- **La base vit dans le code**, le fichier ne porte que ce qui s'en écarte : les sigles
  ajoutés et les libellés de base renommés. Un fichier absent ou effacé rend la base — il
  n'y a rien à amorcer, et rien qui se perde.
- **Un sigle de base** voit son libellé modifiable, jamais son code ni sa catégorie, et ne
  se supprime pas.
- **Un sigle ajouté** : 1 à 4 caractères, lettres et chiffres, commence par une lettre ou un
  chiffre (`4N`), unique **après** normalisation (§2.2), jamais `R…`/`D…` suivi d'un
  chiffre. Le supprimer, ou changer son code ou sa catégorie, est **refusé tant qu'une
  séance de `plan.csv` l'emploie** : `409`, code `swim_code_in_use`, avec la liste des
  séances. Sans cette garde, une séance passée perdrait son total sans que rien ne dise
  pourquoi.
- Modification et suppression sous **`If-Match`**, comme tout le reste.
- L'écran : une section `routes/settings/SwimCodes.tsx`, sur le motif du carnet de
  `/assistant` — une petite collection, corrigeable ligne à ligne, `SwipeRow` pour détruire.

Toute écriture au glossaire invalide `keys.planning.all()` : le programme lu d'une séance
dépend des libellés.

---

## 4. Le planning

### 4.1 Les données

- `KINDS` gagne `natation` ; `Kind` côté API aussi. Une ligne écrite à la main avec
  `natation` avant ce lot était ramenée à `autre` — elle redevient ce qu'elle disait.
- `plan.csv` gagne une colonne **`program`**, défaut `""` (famille *planning* : toutes les
  colonnes ont un défaut). Pas dans `note` : la note porte déjà le lien Cadence, et deux
  contenus dans une même cellule, c'est deux règles d'extraction.
- `PlanPayload.program` : facultatif, 2 000 caractères et 40 lignes au plus, **refusé hors
  `natation`**, lu à l'écriture — une faute est un `422` ligne par ligne. Vide, la séance
  nage se planifie quand même (« piscine libre ») et le total affiche un tiret.
- `PlannedSession.swim` : le programme lu (lignes, total, ventilations), `null` hors
  natation.
- `POST /api/planning/swim/parse` : lit sans rien écrire, pour l'aperçu du formulaire.
- Le flux iCal porte le programme et son total dans `DESCRIPTION`. C'est lui qu'on lit au
  bord du bassin, téléphone dans le sac : l'évènement doit suffire.

### 4.2 L'écran

`Planning.tsx` fait 925 lignes ; il se découpe en `routes/planning/` comme `routes/activity/`.

```
┌──────────────────────────────────────┐
│ Planning               ←  Auj.  →    │
│ octobre 2026                         │
├──────────────────────────────────────┤
│ Respect 78 % · prévues 9 · honorées 7│  une ligne, plus une carte
├──────────────────────────────────────┤
│  L  M  M  J  V  S  D                 │
│  ·  ●  ·  ●  ·  ●  ·                 │  marque teintée par nature
│  …                                   │
├──────────────────────────────────────┤
│ samedi 25 octobre        [Planifier] │
│ ● Natation · 7:00 · 1 h              │
│   Échauffement :                     │
│     400 CR EF                        │
│   Corps :                            │
│     8×100 CR EA PB R20               │
│   2 200 m · CR 2 000 · DOS 200       │
│   ── Fait ──  1 975 m   −225 m       │  §6, côte à côte
├──────────────────────────────────────┤
│ Fil Planning                    [⋯]  │  §5
│  moi  2 séances nage cette semaine   │
│  ○    ┌ Proposition ──────────────┐  │
│       │ mar. 21 · 2 000 m [Retirer]│  │
│       │ ven. 24 · 1 800 m [Retirer]│  │
│       │          [Adopter (2)]     │  │
│       └────────────────────────────┘  │
│ [ ta question…              ] [→]    │
├──────────────────────────────────────┤
│ Coach de course                      │
│ Abonnement calendrier                │
└──────────────────────────────────────┘
```

- **La marque de la grille prend la couleur de sa nature** — un jeton par nature, posé par
  paires `--x` / `--x-rgb` dans les deux thèmes. Le nom accessible dit la nature en toutes
  lettres : une couleur seule ne se lit pas à la synthèse vocale.
- **Le formulaire passe en `Sheet`.** Avec un champ de programme, il pousse la grille hors
  de l'écran s'il reste en ligne. Il entre dans la table `SURFACES` d'`audit-surfaces.mjs`.
- **Le champ de programme** : zone de texte à 16 px, chasse fixe, `autocapitalize="characters"`,
  sans correction ni vérification d'orthographe — sinon iOS « corrige » `PB` en `Pb`.
  L'aperçu (total, ou ligne fautive) vient de `/swim/parse`, 400 ms après la dernière
  frappe. Sous le champ, le glossaire **replié**, et une rangée de puces des sigles
  fréquents qui s'insèrent au curseur — le pouce tape mal `×` et `'`.
- **`ProposalCard` disparaît** (D10). Son `AiBlock` — retrait séance par séance, « Adopter
  (n) », « Pas d'accord » — passe tel quel dans le fil.
- Quatre états, jamais trois. Le fil a les siens : une erreur du fil ne vide pas la grille.

---

## 5. Le fil Planning

### 5.1 Un fil, une portée

`assistant/threads.csv` gagne une colonne **`scope`** : vide pour un fil ordinaire,
`planning` pour celui-ci. **La portée appartient au fil**, pas à l'écran : rouvert depuis
`/assistant`, il garde sa consigne et son catalogue. La liste des fils le montre avec un
badge « Planning ».

`GET /api/assistant/threads/planning` rend le fil Planning, et l'ouvre s'il n'existe pas.
Un seul fil de cette portée ; « Vider le fil » en deux appuis le remet à zéro.

### 5.2 La consigne, et ce qu'elle ne peut pas garantir

Dans la portée `planning`, la consigne ajoute :

- la grammaire du §2.1 et **le glossaire tel que le fichier le porte**, ajouts compris ;
- trois programmes d'exemple écrits dans la notation ;
- la règle : **toute séance de natation porte un programme dans cette notation, et
  seulement elle** ; une réponse qui décrit une séance en prose l'écrit aussi en notation.

Ce que le serveur **vérifie** : les programmes des séances proposées (§5.3). Ce qu'il ne
vérifie pas : la prose de la réponse. Un « fais 400 m de crawl tranquille » dans le texte
passera, et la consigne est la seule garde. Le dire vaut mieux que de prétendre le contraire.

### 5.3 `plan.propose`, et la relance

Le catalogue de la portée `planning` est **restreint** :

| Action | Niveau | |
|---|---|---|
| `plan.propose` | **nouveau** — en attente, par lot | 1 à 14 séances ; programme **obligatoire** pour une natation |
| `plan.delete` | modification | inchangé |

`plan.add` en est **retiré** (D8). Il reste au catalogue ordinaire de `/assistant`, qui ne
change pas de comportement.

La relecture, à chaque réponse :

1. Chaque programme proposé passe par `swim.py`.
2. Une faute, et **s'il reste une passe** dans le budget de la question, le modèle est
   relancé une fois avec la liste exacte : « ligne 3 : « NL » inconnu ; sigles admis : … ».
3. Une seconde faute, ou plus de passe disponible : la séance est **écartée et dite** —
   « Écartée : notation invalide (« NL », ligne 3) », comme `Proposal.dropped`.

**Le budget ne bouge pas : deux appels de modèle par question, au plus.** Si `need` a déjà
consommé la seconde passe, il n'y a pas de relance. Une boucle ouverte sur des modèles
gratuits, c'est une latence et un coût imprévisibles — la règle du §3 d'
[`assistant-agent.md`](assistant-agent.md) vaut ici aussi.

À l'écran, `plan.propose` rend l'`AiBlock` de la proposition. « Adopter (n) » confirme avec
**ce qui reste**, et le serveur relit encore une fois avant d'écrire, `source: ai`.

Une proposition **ne survit pas** à la page qui l'a reçue (voir §9) : le fil ne range que
ce qui a été fait, et un fil rouvert montre la réponse sans son bloc à adopter.

### 5.4 Un seul fil, deux écrans

`Assistant.tsx` fait 1 232 lignes, et le fil — messages, `ActionCard`, zone de saisie,
flux SSE — vit dans le composant d'écran. Il en sort vers `routes/assistant/Conversation.tsx`,
réemployé par les deux écrans. Une seule différence : sur `/assistant` la saisie est ancrée
au bas de l'écran, sous la grille du planning elle suit la page. Le planning montre les six
derniers messages et « Tout le fil » ouvre `/assistant` sur ce fil.

C'est la partie la plus risquée du lot pour ce qui existe déjà : les tests de `/assistant`
doivent passer **sans être retouchés**.

> **Depuis M-20 (28 octobre 2026), un seul écran.** Le fil a quitté `/planning`, qui n'en garde
> qu'une entrée vers `/assistant?portee=planning` ; ses suggestions et ses propositions vivent
> dans l'assistant. La portée tient aussi à la confirmation : `POST /actions/confirm` nomme son
> fil, et `plan.propose` ne s'y confirme que dans le fil du planning
> ([`pages/modifications.md`](pages/modifications.md), M-20).

### 5.5 Ce que le modèle voit en plus

Le planning du mois, les natations réalisées des quatre dernières semaines (après la
phase 6) — distance, repos typique, nage dominante — et les courses. Pas les longueurs une
à une : le condensé reste un condensé (`IA-09`).

---

## 6. Le réalisé — l'import du `.fit` piscine

### 6.1 Ce que le fichier d'exemple contient

`nat.fit`, déposé le 18 octobre 2026. Décodé avant d'écrire ce paragraphe.

| | |
|---|---|
| Appareil | `garmin`, `epix_gen2_pro_47`, logiciel 27.18 — la montre, pas un export |
| Sport | `swimming` / `lap_swimming`, profil « Pool Swim » |
| Départ | 2026-10-11 05:50:32 **UTC**, `local_timestamp` 07:50:32 → **+2 h** |
| Bassin | `pool_length` **25 m** |
| Distance annoncée | **850 m** — 34 longueurs actives |
| Temps | `total_timer_time` 2 165 s, `elapsed` 2 178 s |
| Tours | **33**, `lap_trigger: manual` — un appui à chaque arrêt au mur |
| Longueurs | 56 : 24 crawl, 8 brasse, 2 dos détectés, 22 `idle` |
| Fréquence cardiaque | présente : 2 167 relevés, moyenne et max par tour, `time_in_zone` de séance (FC max 206 réglée sur la montre) |
| Coups de bras | par longueur et par tour |

**Le fait qui décide de tout** : un tour est soit une nage (distance > 0), soit un repos
(distance 0, aucune longueur). Le carnet se lit donc tel quel — `50 m nagés, 31 s de repos,
50 m nagés…` — et se réécrit dans la notation sans rien deviner.

### 6.2 Ce que la montre se trompe à dire

- **Des longueurs coupées en deux.** Trois tours de « 75 m » (n° 0, 11, 25) contiennent deux
  longueurs de 16 à 24 s à 7–9 coups, quand la médiane du crawl est ~39 s à 13–16 coups.
  C'est une longueur comptée deux fois : ces tours faisaient 50 m. La distance vraie est
  plutôt **~775 m**.
- **Une brasse impossible** au tour 0 : 13 s, 3 coups.
- **« Brasse puis crawl »** sur cinq des 50 m, toujours dans cet ordre. C'était du crawl
  (D13) : la première longueur après la coulée est mal lue.

D'où D12 et D13. La règle de soupçon, **à calibrer sur ce fichier** : une longueur active
de moins de 70 % de la durée médiane des longueurs actives de la séance **et** de moins de
10 coups rend son tour « douteux ». Le test de référence exige qu'elle marque **exactement**
les tours 0, 11 et 25 — ni plus, ni moins.

### 6.3 Les données

Sur le patron de la course ([`import-fit.md`](import-fit.md)) :

- `activity/swims.csv` — `swim_id` stable · date · heure de départ · bassin · distance ·
  temps de nage · temps total · FC moyenne et max · coups · calories · `fit_path` · source.
- `activity/swim_laps.csv` — `swim_id` · rang · `nage` ou `repos` · distance · durée · nage
  **détectée** · nage **corrigée** (vide par défaut) · coups · FC · douteux.
- Le `.fit` archivé dans `activity/fit/`, comme ceux des courses.
- La correction d'une nage se fait **au tour**, sous `If-Match`, et ne touche jamais la
  nage détectée : on garde ce que la montre a dit, et ce que tu en as dit.

`POST /api/activity/fit` lit le sport et aiguille vers la course ou la nage ; la route des
courses reste. Le refus « ce fichier décrit une sortie natation » disparaît pour la piscine
et **reste** pour l'eau libre (`open_water`) et le vélo : une sortie sans longueurs n'a rien
à faire dans `swim_laps.csv`.

### 6.4 La réécriture, et le côte à côte

Le serveur réécrit les tours dans la notation : la nage **corrigée**, sinon la nage
détectée si le tour est homogène, sinon la nage dominante de la séance — et ce tour-là
**marqué** « nage détectée », jamais présenté comme sûr. Les tours consécutifs de même
distance et de même nage, aux repos proches (± 15 s), se regroupent ; le repos du groupe
est une moyenne arrondie à 5 s, notée `R~40`. Le tilde n'existe qu'en sortie : il dit
« moyenne », et le formulaire de planning le refuse.

Sur le fichier d'exemple, la réécriture **attendue** — à relire et valider avant d'en
faire le test de référence :

```
75 DOS ⚠ douteux · R~25
4×50 CR · R~40         nage détectée sur 2 tours
75 CR ⚠ douteux · R40
50 CR · R40
50 CR · R2'50          le repos long rompt le groupe
…
                        → 850 m annoncés, dont 3 tours douteux
```

Dans le panneau du jour, la séance prévue et la séance faite se lisent **côte à côte**, avec
l'écart en mètres calculé par le serveur. Une natation prévue n'est **honorée que par une
natation** le même jour (D15) ; pour les autres natures, `PLAN-06` ne change pas.

---

## 7. Ordre d'exécution

| Phase | Contenu | Vérifié par |
|---|---|---|
| **1** | `planning/swim.py` : grammaire, tolérances, base du glossaire, totaux. Pur | Tests sur chaînes fixes, dont `×`/`x`, `’`, casse, accents, parenthèses, `R`+`D` refusés |
| **2** | Glossaire : `swim_codes.csv`, routes sous `If-Match`, `swim_code_in_use`, section Réglages | Tests de domaine ; `audit-mobile` deux thèmes |
| **3** | `natation`, colonne `program`, `PlannedSession.swim`, `/swim/parse`, iCal | Tests de domaine ; une ligne ancienne relue sans colonne `program` |
| **4** | L'écran : découpe `routes/planning/`, `Sheet` du formulaire, jetons par nature, retrait de `ProposalCard` | Tests d'écran ; `audit-mobile` deux thèmes ; `audit-surfaces` avec la nouvelle feuille ; **les captures regardées** |
| **5** | Le fil : `scope`, route du fil Planning, consigne, `plan.propose`, relance, `Conversation.tsx` | Tests sur réponses **simulées**, dont une faute relancée et une faute écartée ; tests `/assistant` inchangés et verts |
| **6** | L'import : `swim_fit.py`, `swims.csv`, `swim_laps.csv`, aiguillage, soupçon, correction, réécriture, honneur | Une fixture **synthétique** reproduisant la forme de `nat.fit` ; tours 0, 11, 25 marqués et eux seuls |

`make check` vert à chaque phase, et un commit par phase.

**OpenRouter n'est pas appelé pendant le développement.** Toute la phase 5 se fait sur des
réponses simulées, comme les lots L12 à L14. Une passe de bout en bout sur le vrai service,
à la fin, **sur accord préalable** — c'est elle qui dira si un modèle gratuit tient la
notation.

---

## 8. Les risques, et ce qui n'est pas fait

**Le risque principal : un modèle gratuit qui ne tient pas la grammaire.** Une notation
stricte et un refus net sont exactement ce qu'il faut pour la donnée, et exactement ce qui
fera écarter des séances. La passe réelle de la phase 5 compte les séances écartées ; au-delà
d'une sur trois, la consigne est à reprendre (plus d'exemples) avant d'assouplir quoi que
ce soit.

**`nat.fit` n'entre pas dans le dépôt.** C'est une vraie donnée de santé, horodatée et
cardiaque. Les tests reposent sur une fixture synthétique de même forme, comme ceux de la
course. Le fichier est à la racine, non suivi : à ranger hors du dépôt.

**`plan.csv` et `threads.csv` gagnent chacun une colonne.** Lecture tolérante des lignes
anciennes, rien à migrer — mais une ouverture dans un tableur la montrera.

**Laissé de côté, nommément :**

- la durée estimée depuis une allure au 100 m (D6) ;
- les zones cardiaques de la nage — décodées, présentes dans le fichier, non affichées ;
- l'eau libre, refusée en toutes lettres ;
- les synonymes de sigles (D9) ;
- la vérification de la prose des réponses (§5.2) ;
- `plan.propose` sur `/assistant` : le fil ordinaire garde `plan.add` tel quel. Unifier les
  deux comportements est une question à part.

---

## 9. Ce qui a été livré, et ce qui a dévié

| Phase | Commit | État |
|---|---|---|
| 1 — la notation | `feat(plan): la notation de nage se lit…` | ✅ 53 tests purs |
| 2 et 3 — glossaire et données | `feat(plan): une séance de natation porte son programme…` | ✅ réunies : la garde du glossaire ne se vérifie que sur des séances qui portent un programme |
| 5 — le fil, côté serveur | `feat(ia): le fil Planning propose…` | ✅ 15 tests sur réponses simulées |
| 6 — l'import, côté serveur | `feat(act): une natation en piscine s'importe…` | ✅ le fichier réel marque exactement les tours 0, 11, 25 |
| 4 — l'écran, et le front des phases 2, 5, 6 | `feat(plan): /planning refait pour la natation…` | ✅ regardé à 402, 390, 360 px, deux thèmes |

**Ce qui a dévié du plan :**

- **Une proposition en attente n'est pas rangée avec le message.** Le plan la voulait
  adoptable trois jours plus tard. Le fil ne range que ce qui a été fait ; ranger une
  proposition l'aurait laissée « à adopter » après son adoption, faute de lien entre la
  confirmation et le message. Elle vit donc le temps de la page.
- **Le fil n'a pas été extrait en un seul composant**, mais en deux modules :
  `routes/assistant/useConversation.ts` (l'état) et `Conversation.tsx` (les tours, les
  cartes d'action). Chaque écran garde sa saisie et sa mise en page ; les 49 tests de
  `/assistant` passent sans retouche.
- **La natation se distingue à la forme dans la grille, pas à la couleur** : la charte a
  quatre teintes et chacune a un sens. Une barre pour la natation, un point pour le reste.
- **`Chip` tient désormais le plancher en largeur** (`min-width: var(--tap)`) : une pastille
  d'un caractère — `×`, `R` — mesurait 39 px. Le correctif vaut pour toute l'application.
- **`TextArea` rejoint les primitives**, pour le champ de programme.
- **Un `.fit` de nage déposé à l'import de course** est réaiguillé sur le code
  `fit_is_swim` et mène au planning, sur le jour de la séance (`?jour=`).

**Ce qui n'a pas été fait :**

- **Le vrai OpenRouter n'a pas été appelé.** Tout le fil a été éprouvé sur réponses
  simulées, y compris à l'écran. La première vraie question dira si un modèle gratuit tient
  la notation — compter les séances écartées (§8).
- **À 360 px, les cases du calendrier font 39 px de large**, sous le plancher. C'était vrai
  avant ce lot — sept colonnes dans 360 px — et la grille n'a pas changé de structure.
- Les natations n'apparaissent pas dans l'historique de `/activite` : elles vivent au
  planning, à côté de ce qui était prévu.

