# Ce qu'il faudrait changer dans les pages — et pourquoi

Les treize documents de ce dossier disent ce que chaque destination contient. Celui-ci en
tire les conséquences : ce qui se répète, ce qui manque, ce qui est rangé ailleurs que là
où on le cherche. **Rien n'est codé.** Chaque fiche dit ce qui change, pourquoi, ce que ça
coûte et ce que ça risque ; l'ordre de réalisation est au §5.

Le regard est celui de l'**usage quotidien** d'un seul utilisateur : le matin (relevés,
séance du jour), la séance (lancer, noter), le repas, le soir (bilan, demain). Une
redondance qui fait gagner un geste à l'un de ces moments reste ; celle qui n'en fait
gagner aucun part.

**Priorités.**

- **P1** : gêne l'usage quotidien, ou fait dire à l'écran quelque chose de faux.
- **P2** : redondance ou détour qui coûte du défilement ou de l'hésitation.
- **P3** : confort, ou décision de produit à prendre avant de coder.

---

## 1. La matrice — où vit chaque donnée

`L` l'écran la montre · `É` il l'écrit · `R` il la règle · `—` absente.
« Parcours » regroupe la feuille « Noter », le parcours du matin et le point du soir.

| Donnée | `/` | Activité | Assistant | Nutrition | Routine | Planning | Plan | Objectif | Corps | Charge | Assiduité | Réglages | Parcours |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Poids | L ×3 | L | É | — | — | — | — | — | L É | — | — | R (cible) | É |
| Mensurations | — (M-06) | — | — | — | — | — | — | — | L É (courbe, historique, correction — M-08) | — | — | — | — |
| FC de repos, VFC | L (nuit) | L (page course) | — | — | — | — | — | — | L É (courbe, liste, correction — M-09) | — | — | — | É (matin) |
| Douleur | L (alertes → `/corps/douleurs`) | É (après import) | — | — | — | — | — | — | L É (`/corps/douleurs`, porte en tête de `/corps` — M-08) | L (frise) | — | — | É |
| Eau | L ×2 | — | É | — | L É R (cible, raccourcis — M-04) | — | — | — | — | — | L | — | É |
| Suppléments | L | — | É | — | L É R | — | — | — | — | — | L | — | É |
| Protéines, calories | L ×2 | — | É | L É | — | — | — | — | — | — | — | R | — |
| Séance prévue | L | L (respect) | É | — | — | L É | É (plan) | — | — | — | — | — | L |
| Proposition du coach | — | L (page course) | — | — | — | L | — | — | — | — | — | — | L (matin) |
| Effort perçu | — | É ×4 | — | — | — | — | — | — | — | L | — | — | É |
| **Charge d'entraînement** | L (forme) | **L (course, FC)** | — | — | — | — | — | — | — | **L (tous sports, RPE)** | — | — | — |
| **Volume hebdomadaire** | L (tuile « Semaine ») | L ×3 (de leur sport) | — | — | — | — | — | — | — | **L (tous sports — M-07)** | — | — | — |
| Facile / modéré / dur | — | L (constat, 14 j — M-02) | — | — | — | — | — | — | — | L (80 %, 28 j) | — | — | — |
| Objectif daté | L | — | (condensé) | — | — | — | — | L É | — | — | — | — | — |
| Course visée (A/B/C) | L (la course A — M-19) | — | — | — | — | — | L É | — | — | — | — | — | — |
| Agenda iCloud, changements du coach | — | — | — | — | — | L É (M-03) | — | — | — | — | — | — | L É (soir) |
| Ce que l'assistant sait de toi | — | — | L É (profil et carnet, une feuille — M-05) | — | — | — | — | — | — | — | — | — | — |
| Séances Cadence | — | L É R (adresse — M-04) | É | — | — | — | — | — | — | — | L (séries) | — | — |

Trois lignes portent l'essentiel : **la charge** (deux calculs, deux verdicts), **le
volume hebdomadaire** (six lectures sur trois écrans — une seule tous sports depuis M-07,
les autres sont un chiffre ou le volume d'un sport), et **ce que l'assistant sait de
toi** (deux endroits — un seul depuis M-05). Trois autres montraient des trous : les mensurations et la FC du
matin s'écrivaient sans se relire — les deux se relisent depuis M-08 et M-09 —, la course
visée ne parlait à aucun autre écran — elle parle à l'accueil depuis M-19.

---

## 2. Synthèse

| Id | Sorte | Pages | En une ligne | Prio. |
|---|---|---|---|---|
| [M-01](#m-01) | ajouter | Nutrition, matin, assistant | Noter un repas d'hier — **fait** (`331ae7e`, restes `34bbce7`, `7c895ff`, `74dfc9d`, `d1de02d`), l'assistant avec M-10 (`21fb4f4`) | **P1** |
| [M-02](#m-02) | fusionner | Activité (courses), Charge, Accueil | Une seule règle du facile — **fait** (`385871a`, `1fa151b`), sauf le point 4 | **P1** |
| [M-08](#m-08) | ajouter, déplacer | Corps | Mensurations corrigeables, les douleurs à leur adresse — **fait** (`ae706b7`, `cdeda08`) | **P1** / P2 |
| [M-21](#m-21) | corriger | Charge, Activité | Quatre phrases fausses ou illisibles relevées en passant — **fait** (`3bcde3f`) | **P1** |
| [M-23](#m-23) | déplacer | Nutrition, Noter | Les favoris dans la feuille « Ajouter un repas » — **fait** (`34bbce7`, type au rejeu `d1de02d`) | P2 |
| [M-03](#m-03) | déplacer | Plan, Planning | L'agenda et « ce que le coach a changé » au planning — **fait** (`c9b1433`) | P2 |
| [M-04](#m-04) | déplacer | Réglages et six écrans | Chaque réglage à côté de l'écran qu'il règle — **fait** (`96f1f8f`, `1d05b4d`, `3d5c8c8`, `58ba44b`, `4d902ce`) | P2 |
| [M-06](#m-06) | supprimer | Accueil | « Tendance » et « Entraînement » quittent l'accueil — **fait** (`c67f06f`) | P2 |
| [M-07](#m-07) | fusionner | Accueil, Activité, Charge | Le volume hebdomadaire tous sports n'a qu'une maison : `/charge` — **fait** (`c67f06f`) | P2 |
| [M-09](#m-09) | ajouter | Corps | FC de repos et VFC relues en série — **fait** (`96d81d9`) | P2 |
| [M-10](#m-10) | ajouter | Assistant | Douleur, natation, effort perçu par l'assistant — **fait** (`21fb4f4`, `84977aa`, `26b8e68`, `388937f`, `0c4c28d`) | P2 |
| [M-13](#m-13) | renommer | toutes | « Objectif », « Planning », « Charge », « Course », « Coach » : un mot, un sens — **fait** (`21a1672` → `c2f44fa`, `827b293`) | P2 |
| [M-14](#m-14) | supprimer | Activité | La carte « Import d'une capture », doublon de l'étape 1 — **fait** (`ded7779`) | P2 |
| [M-15](#m-15) | corriger | Activité | Une natation `.fit` s'ouvre dans sa feuille, pas au planning — **fait** (`9f1e991`) | P2 |
| [M-05](#m-05) | fusionner | Assistant, Réglages | Profil et carnet au même endroit — **fait** (`ea1aeb4`, `58cf652`) | P3 |
| [M-11](#m-11) | corriger | Accueil | L'état vide ouvre « Noter » au lieu de changer d'écran | P3 |
| [M-12](#m-12) | déplacer | Plus | Des groupes qui suivent les moments de la journée — **fait** (`64e3f49`) | P3 |
| [M-16](#m-16) | ajouter | Activité | Un vélo ou une marche saisis à la main — **fait** (`2cc88e0`, `7eaa41f`) | P3 |
| [M-17](#m-17) | ajouter | Plan | Corriger une course visée — **fait** (`defb1cd`) | P3 |
| [M-18](#m-18) | ajouter | Réglages | L'état de la synchro Garmin à l'écran — **écartée** (27 octobre : aucune synchro Garmin, voir §6) | P3 |
| [M-19](#m-19) | ajouter | Accueil, Objectif, Plan | La course A dans « Où je vais » — **fait** (`af2202d`) | P3 |
| [M-20](#m-20) | fusionner | Planning, Assistant | Un seul coach sur le planning — **fait** (`685c4af`, `bbacdd7`) | P3 |
| [M-22](#m-22) | supprimer | Accueil | La rangée « Assistant » en pied d'accueil — **fait** (`fc178f8`) | P3 |

---

## 3. Les fiches

<a id="m-01"></a>

### M-01 — Noter un repas d'hier

**Ajouter · P1 · Nutrition, parcours du matin, assistant**

**Constat.** Aucun repas ne se date dans le passé : la feuille « Ajouter un repas » écrit
à l'heure du serveur, la fiche refuse de corriger l'heure (le composer à l'écran serait un
calcul de date), l'action de l'assistant s'appelle « noter un repas **du jour** ». Le
parcours du matin affirme pourtant « Aucun repas noté hier — ils se rattrapent depuis
Nutrition » ([`MorningFlow.tsx`](../../frontend/src/routes/morning/MorningFlow.tsx), étape
« La journée »).

**Raison.** Le dîner oublié se rattrape le lendemain matin — c'est précisément le moment
où l'application le rappelle. Aujourd'hui, le seul choix est de le noter faux (daté du
jour, il gonfle la journée en cours) ou de ne pas le noter (la veille ment). Les deux
salissent l'historique, la courbe des calories et le condensé de l'assistant.

**Ce qui change.** La feuille propose « aujourd'hui / hier » (deux jours suffisent à
l'usage, et on reste loin d'un sélecteur de date) ; les deux jours et leur libellé
viennent du serveur, avec `GET /api/nutrition`. Le serveur reçoit un **jour** (`today` ou
`yesterday`), jamais une heure composée par le client, et pose l'heure lui-même. La
phrase du matin mène à la feuille, ouverte sur « hier ». L'action `meal.add` reçoit le
même champ.

**Coût.** Serveur : un champ facultatif sur `POST /api/nutrition` et
`POST /api/nutrition/composed` (aujourd'hui sans `datetime` à la création —
[`router.py:83`](../../backend/app/domains/nutrition/router.py#L83)), et ses tests. Front :
un segment dans `MealSheet`. Pas de donnée à migrer.

**Risque.** L'invariant « le jour vient du serveur » : le respecter en ne laissant au
client que le **choix** d'un jour servi, ce que le §2 du `CLAUDE.md` autorise
(« choisir quelle page demander »).

**Fait le 22 octobre** (`331ae7e`), sauf l'assistant. Les lignes citées étaient exactes.

- **Décisions.** Deux jours, aujourd'hui par défaut. `meal.add` n'est pas touché. Le lien
  du matin : `/nutrition?ajout=hier`. **L'heure d'un repas d'hier est celle de son type**
  (`TYPICAL_TIME` : 08:00, 12:30, 16:30, 20:00 ; midi pour un type libre) — l'heure de la
  saisie aurait daté de 07:00 un dîner noté au réveil. Chaque heure tombe dans la fenêtre
  de `TYPE_BY_HOUR`, un test le tient.
- **Le contrat.** `GET /api/nutrition` sert `days` (`key`, `date`, `label`). Les deux POST
  prennent `day` : `today`, `yesterday` ou une date servie ; hors des deux jours,
  `validation_error` sur `body.day`, rien d'écrit. La feuille renvoie la **date servie**,
  pas `yesterday` : « hier » choisi à 23 h 58 reste le jour qu'on avait sous les yeux.
- **Le brouillon** retient le jour (il vit dans `values`). Un jour qui n'est plus servi
  — un brouillon repris passé minuit — ne sélectionne aucun segment et bloque
  l'enregistrement, avec une phrase ; il n'est jamais rabattu sur aujourd'hui.
  « Changer de mode » garde le jour.

**Changé en route.**

- Le jour de l'adresse ne pouvait pas s'écrire dans l'effet d'ouverture (règle
  `react-hooks/set-state-in-effect`) : la feuille est remontée (`key`) quand l'adresse en
  impose un, et le prend à l'initialisation. L'état « feuille ouverte » de `/nutrition`
  est dérivé de l'adresse : le parcours du matin est une feuille globale, son lien peut
  être suivi depuis `/nutrition` déjà monté.
- Le lien du matin **ferme le parcours**, qui sinon recouvrirait la feuille ; non fini, il
  revient à l'ouverture suivante. Écrire un repas invalide aussi le parcours.
- Le message d'enregistrement dit où va un repas d'hier (« Il compte pour hier : le
  journal ne montre que la journée ») — sans lui, le repas avait l'air perdu.
- Vus à l'écran : « Aujourd'hui » servi avec une apostrophe droite ; une note qui passait
  à la ligne sur « : c'est… ». En passant : « 1 repas notés hier » accordé.

**Reste.**

- ~~**`meal.add` de l'assistant**~~ Fait avec M-10 (`21fb4f4`) : `day` (`today` |
  `yesterday`) relu par `resolve_day`, l'heure du type non relevée, et pour hier l'un des
  quatre types exigé.
- ~~**Rejouer un favori** se date toujours de l'instant.~~ Fait avec M-23 (`34bbce7`) :
  `POST /favorites/{id}/replay` prend `{day}`, validé comme les deux autres POST.
- **La fiche d'un repas** ne corrige toujours pas l'heure ni le jour.
- ~~**L'heure type passe pour une heure relevée.**~~ Fait (`7c895ff`) : `meals.csv` porte
  `time_recorded` en dernière colonne (vide = vrai, faux pour un repas rattrapé) ; `Meal`
  sert `time_recorded` et `day_label` ; la fiche titre « Hier, heure non relevée » — vue à
  l'œil depuis `74dfc9d`, qui l'ouvre depuis le journal d'hier.
- ~~**Un repas rattrapé est intouchable.**~~ Fait (`74dfc9d`), ci-dessous.
- ~~**Un favori rejoué pour hier prend le type de l'heure présente.**~~ Fait (`d1de02d`),
  ci-dessous, avec la saisie normale, qui avait le même défaut.
- **Ouvrir un jour depuis la grille de l'historique.** Au-delà d'hier, un repas ne se
  relit, ne se corrige ni ne se supprime qu'au tableur. Une autre fiche : `GET
  /api/nutrition?day=` refuse tout autre jour que les deux servis, et l'ouvrir à la grille
  demande d'abord de décider ce que « servi » veut dire pour une date passée.

**Les deux restes, faits le 22 octobre au soir** (`74dfc9d`, `d1de02d`).

- **Décisions** (questions posées avant de coder ; quatre réponses, toutes celles
  proposées en premier). Un segment « Aujourd'hui / Hier » **au-dessus du Journal** ; il
  porte les deux jours servis (`days`, leurs `label`) ; le journal **et** les totaux le
  suivent, le titre devient « Repas d'hier » ; l'historique ne bouge pas. Au-delà d'hier :
  non. Pour hier, un appui sur un favori **demande le type** en pastilles (`Chip`, à la
  place de la bande), puis rejoue ; « Un autre favori » rend la bande. La saisie normale
  avait le même défaut (`values.meal_type || suggested`) : pour hier, **aucun type
  présélectionné**, « Choisir le repas » et une phrase, l'enregistrement attend. Devant le
  journal d'hier, « Ajouter un repas » ouvre la feuille sur hier.
- **Le contrat.** `GET /api/nutrition?day=` : `today`, `yesterday` ou une date servie,
  validé par `resolve_day` — qui nomme maintenant le champ fautif (`query.day`) ; `days`
  part toujours du vrai aujourd'hui, quel que soit le jour lu. `POST
  /favorites/{id}/replay` prend `meal_type` : facultatif aujourd'hui (l'heure le
  propose), **exigé** pour hier — sans lui, `validation_error` sur `body.meal_type`,
  rien d'écrit. Le serveur ne devine plus le type d'un autre jour.
- **L'écran.** La journée reste chargée (en-tête, feuille, fiche, favoris) ; une seconde
  requête, active sur « Hier » seulement, sert journal et totaux — le segment ne
  disparaît pas pendant qu'hier arrive. Le choix est une **clé** (`yesterday`), traduite
  en date par `days` : passé minuit, il suit le serveur. Quatre états, dont « Aucun repas
  noté hier » avec « Rattraper un repas d'hier ».

**Changé en route.**

- Les « puces de type existantes » n'existaient pas : le type est un `<select>`, à la
  feuille comme à la fiche. Les pastilles du favori sont des `Chip`, la primitive de la
  bande des favoris.
- La page porte maintenant un second segment « Hier » : sept tests d'écran visaient le
  premier bouton de ce nom et ont dû viser celui de la feuille.
- Le message d'un repas rattrapé disait « le journal ne montre que la journée » : il dit
  où le voir. La carte Favoris disait « d'un appui » : faux pour hier, retiré.
- **Supprimer** un repas se fait sur sa ligne du journal (deux appuis), pas dans la fiche :
  c'était déjà le cas aujourd'hui, et le journal d'hier le reprend tel quel.

<a id="m-02"></a>

### M-02 — Une seule règle du facile, une charge qui ne se contredit pas

**Fusionner · P1 · Activité (`/activite/courses`), Charge, Accueil**

**Constat.** Deux calculs de charge coexistent :

| | `/activite/courses` (`Trends`) | `/charge` et le bloc « Forme » de l'accueil |
|---|---|---|
| Ce qui compte | minutes pondérées par zone de FC | effort perçu × minutes |
| Sports | course seule | tous |
| Séance sans la mesure | comptée si elle a la FC | **ignorée** sans effort perçu |
| Cible de facile | **70 %** sur **14 jours** ([`activity/load.py:48`](../../backend/app/domains/activity/load.py#L48)) | **80 %** sur **28 jours** ([`training/intensity.py:27`](../../backend/app/domains/training/intensity.py#L27)) |
| Conseil | « la prochaine sortie est facile » | aucun |

Sur le banc — dix courses `.fit` sans effort perçu —, la page Courses affiche une charge
7 jours de 297 et conseille la sortie suivante, pendant que l'accueil et `/charge` disent
« Pas encore de charge globale ».

**Raison.** Le matin, la question est « je cours dur ou facile aujourd'hui ? ». Deux écrans
y répondent avec deux seuils, et l'un des deux peut se taire pendant que l'autre conseille.
Un coach qui se contredit d'une page à l'autre perd la confiance qu'il demande.

**Ce qui change.**

1. **Une seule constante de facile**, définie à un endroit et importée par les deux
   services. Lequel des deux seuils garder est une **décision** : 80 % (Seiler, ce que
   `/charge` cite) est la référence, 70 % une tolérance de coureur amateur. À trancher
   avant de coder.
2. **Le conseil quitte la page Courses** : conseiller la séance suivante est le métier du
   coach (`CoachCard`), qui s'affiche déjà sur la page d'une course, au matin et au
   planning. La page Courses garde ses chiffres, pas sa recommandation.
3. **La page Courses renvoie à `/charge`** pour la charge tous sports, et nomme la sienne
   « charge de course (FC) » pour qu'on ne lise pas deux fois le même mot.
4. **À décider, pas à coder tout de suite** : une course `.fit` avec FC mais sans effort
   perçu pourrait entrer dans la charge globale par sa charge FC convertie. C'est ce qui
   ferait disparaître le « aucune charge » d'un utilisateur qui court avec une montre et
   n'a pas le réflexe de noter son effort — mais c'est une règle métier nouvelle, avec son
   propre plan.

**Coût.** Serveur : la constante partagée et le texte du conseil retiré
(`activity/load.py`) ; tests des deux services. Front : un libellé et un lien sur `Trends`.
Le point 4 est un lot à part.

**Risque.** Faible pour 1 à 3. Le point 4 change ce que vaut la forme : ne pas le glisser
dans le même commit.

**Fait le 22 octobre** (`385871a`, `1fa151b`), points 1 à 3. Les lignes citées étaient
exactes. **Le point 4 reste ouvert.**

- **Ce qui a été mesuré avant de trancher.** `EASY_SHARE_MIN` ne servait pas qu'au texte :
  `coach/frame.py` s'en servait pour fermer le dur. Sur le cadre pur, 14 jours de course :
  quatre footings purs et une qualité font 85 % de facile, six footings et deux qualités
  82 % — rien ne change à 80 %. Mais **deux footings de 40 min et une qualité (15 min en
  zone 2, 30 en zone 4) par semaine font 76 %**, des footings qui dérivent de 15 % en
  zone 3 avec une qualité 74 % : à 80 %, le cadre n'y permettait plus que repos,
  récupération, footing et sortie longue, et retirait le test de FC max. Une qualité
  toutes les deux semaines au lieu d'une, pour un coureur qui ne court jamais deux jours
  d'affilée.
- **Décisions (de l'utilisateur).** **80 % pour les pages, 70 % pour le coach.** La cible
  est une seule constante, `training/intensity.EASY_TARGET`, et la phrase de `/charge` se
  rédige depuis elle. Le coach garde un **plancher** à lui, `coach/frame.EASY_SHARE_FLOOR`,
  commenté comme tel avec le chiffrage ci-dessus ; sa phrase dit « en course sur
  14 jours ». Les fenêtres restent séparées (14 jours pour la course, 28 tous sports) et
  chaque texte nomme la sienne. La page Courses garde le constat chiffré, sans
  recommandation.
- **Ce qui a changé en route.** `activity/load.py` n'importe **aucune** constante de
  facile : une fois le conseil parti, la page Courses ne compare plus sa répartition à
  rien, et `EASY_SHARE_MIN` a disparu. Le point 1 tient donc par une seule cible, celle de
  `/charge`, et un plancher qui n'appartient qu'au coach.
- **Le front.** La section s'appelle « Charge de course (FC) » et sa carte finit sur
  « Charge tous sports », le même `LinkButton` ghost que le bloc « Forme » (187 × 48 px).
- **Tests.** Aucun test du coach ne couvrait la règle ; deux l'épinglent : 65 % ferme le
  dur, 76 % le laisse ouvert — ce dernier casse si le plancher repasse à 80 %, essayé.

**Reste.**

- **Le point 4** : une course `.fit` avec FC et sans effort perçu n'entre toujours pas dans
  la charge globale. Sur le banc, la page Courses montre une charge 7 jours de 310 pendant
  que l'accueil dit « Pas encore de charge globale » ; chacune dit désormais son nom, mais
  l'écart demeure. Lot à part, avec son plan.

  **Décision du 28 octobre** (session 10 c) : une course avec FC et sans effort perçu entre
  dans la charge globale par sa **charge FC convertie**, dite à l'écran « **estimée depuis
  la FC** » ; dès que l'effort perçu est noté, il la **remplace**. Le lot garde son plan à
  part, comme le demandait le risque de la fiche.
- **Les phrases du rapport aigu/chronique** (« au-dessus de 1,5, on ne fait plus que du
  facile ») sont aussi un conseil et restent sur la page Courses : `/charge` dit la même
  chose de son propre rapport, et les retirer d'une page seule recréerait l'écart.
- **Des parts arrondies qui ne font pas 100.** « 85 % facile, 0 % modéré, 14 % dur » sur
  le banc, « 2 %, 10 %, 89 % » dans un test : chaque part est arrondie seule. Antérieur.
- **« Facile » en rouge sur la page Courses**, en vert sur `/charge` : la barre prend la
  teinte de la zone 2 (`styles.z2`). Antérieur ; `accueil-et-charge.md` l'avait corrigé sur
  `/charge` seulement.

<a id="m-03"></a>

### M-03 — L'agenda et « ce que le coach a changé » au planning

**Déplacer · P2 · Plan, Planning**

**Constat.** `/plan` porte deux blocs qui n'ont rien de propre au plan de course : la
carte **Agenda** (le lien iCloud qui fait placer et déplacer *toutes* les séances) et
**Ce que le coach a changé** (toutes les replanifications). `/planning`, où les séances
bougent, n'a ni l'un ni l'autre ; il a l'abonnement calendrier, le pendant sortant de
l'agenda.

**Raison.** Le soir, après un déplacement par le coach, on va voir le calendrier : c'est
là que la séance a bougé, et c'est là qu'on voudrait dire « non, remets ». Aujourd'hui il
faut savoir que ça se passe sur la page du plan de course.

**Ce qui change.** `AgendaCard` et `Changes` passent sur `/planning`, sous le mois, à côté
de l'abonnement. `/plan` garde les courses visées, les conflits et le plan. Le point du
soir garde ses changements — c'est la même composante, qui ne bouge pas.

**Coût.** Front seul : deux composants déplacés, sans changer d'appel
(`GET /api/planning/agenda`, `GET /api/planning/changes`). Les tests de `Plan` et de
`Planning` suivent.

**Risque.** Aucun sur les données. `/planning` s'allonge de deux cartes ; les poser repliées
quand il n'y a rien à montrer.

**Fait le 26 octobre** (`c9b1433`).

- **Décisions** (par défaut) : `/planning` se lit mois → jour choisi → **Ce que le coach a
  changé** (carte absente quand il n'y a rien) → séance proposée par le coach → coach du
  planning → **Agenda** → abonnement calendrier. La séance du coach passe ainsi avant le
  fil, l'inverse d'avant. `/plan` garde les courses visées, les conflits et le plan
  jusqu'à la course A, et n'appelle plus aucune route du planning.
- Mêmes composants, mêmes appels ; le point du soir garde `Changes`, qui n'a pas bougé.
  Sur `/planning`, la carte porte son titre en `h3`, comme l'agenda et l'abonnement — sur
  `/plan` c'était un trait de section.
- Hauteurs, banc rempli à 402 px (agenda relié par une doublure, deux changements — une
  séance allégée pour la douleur, une déplacée par un créneau pris) : `/planning` 2 366 →
  3 175, `/plan` 2 839 → 1 955 ; vide : 2 114 → 2 494 et 1 069 → 874.
- Éprouvé sur le banc : « Non, remets comme avant » sur le déplacement par l'agenda remet
  la séance à 18:30 et retire la ligne, l'autre changement reste. Le point du soir, sa
  fenêtre avancée à 14 h sur le banc seulement, montre toujours le sien, en sombre comme
  en clair.

**Reste.** ~~La carte Agenda reste dépliée une fois reliée : le champ « Changer le lien » y
est toujours visible.~~ Repliée depuis, avec M-04 (`6c2e003`). Le risque demandait de replier « quand il n'y a rien à montrer » ;
l'agenda a toujours un état à dire, et le replier changerait `AgendaCard` au-delà du
déplacement. `docs/agenda-replanification.md` (D9, et la liste des écrans) dit encore
`/plan` : c'est le plan d'avant, laissé tel quel.

<a id="m-04"></a>

### M-04 — Chaque réglage à côté de l'écran qu'il règle

**Déplacer · P2 · Réglages, Assiduité, Assistant, Planning, Activité, Routine**

**Constat.** `/reglages` fait 11 357 px et contient sept pages : cibles quotidiennes,
adresse de Cadence, repères de course, pistes d'assiduité et jours neutralisés, profil de
l'assistant, glossaire de nage, rappels, sécurité, apparence. Chaque section appartient
à un autre écran, et chaque « Aller aux réglages » atterrit en haut de la page.

**Raison.** Un réglage se cherche **depuis la chose qu'il règle** : on veut changer la
cadence d'une piste en la regardant sur `/assiduite`, ajouter un sigle en écrivant une
natation. Le défilement de 11 000 px est le symptôme ; la cause est le rangement.

**Ce qui change.**

| Section | Nouvelle place |
|---|---|
| Pistes d'assiduité, jours neutralisés | `/assiduite`, dans une feuille « Régler les pistes » |
| ~~Ce que je suis (profil)~~ | `/assistant`, à côté du carnet — **fait** avec M-05 (`58cf652`) |
| Glossaire de nage | `/planning`, feuille ouverte depuis le clavier de sigles |
| FC max, allure seuil | la page Courses, et le lien « Corriger dans les réglages » de la page d'une course y mène |
| Adresse de Cadence | `/activite/seances` (là où son absence est déjà signalée) |
| Cible d'eau, raccourcis | `/routine`, sur la carte Hydratation |
| Cibles de poids, protéines, calories, sucres | **restent** dans Réglages : elles servent à plusieurs écrans |
| Rappels, point du soir, sécurité, données, apparence, IA | **restent** : ce sont des réglages de l'application, pas d'un écran |

Ce qui reste fait une page de réglages de taille ordinaire.

**Coût.** Front : déplacer des composants qui existent déjà (`Tracks`, `Profile`,
`SwimCodes`) et découper le formulaire de `Settings.tsx`, qui envoie aujourd'hui une seule
`PATCH /api/settings` pour quatre sections — chaque morceau déplacé enverra sa propre
`PATCH` sous `If-Match`. Aucun changement serveur. Le plus gros lot de ce document.

**Risque.** La barre collante « Enregistrer » (fiche 24 de l'audit) se multiplie : un
réglage déplacé doit garder un enregistrement explicite, pas s'écrire à la frappe. Et
`Tracks.tsx` (840 lignes) est déjà dans la liste des fichiers à découper du `CLAUDE.md`
§7 : le faire au passage.

**Fait le 26 octobre** (`96f1f8f`, `1d05b4d`, `3d5c8c8`, `58ba44b`, `4d902ce`, puis `af749b1`,
`38fa723` et, en option, `6c2e003`).

| Section de `/reglages` | Où elle est |
|---|---|
| Adresse de Cadence | `/activite/seances` : absente, la carte d'en tête porte le champ ; réglée, une ligne de pied « Adresse de Cadence » + Modifier |
| FC max, allure seuil | `/activite/courses`, section « Repères » repliée en pied de page (carte « Zones d'intensité ») ; `/activite/courses#reperes` l'ouvre et y descend, et c'est l'adresse des deux liens de la page d'une course |
| Cible d'eau, volumes des raccourcis | `/routine`, au pied de la carte Hydratation : une ligne « Objectif 2 L · raccourcis … » et « Régler », replié |
| Glossaire de nage | `/planning/sigles`, sous-page ; lien « Les sigles de nage » en pied de `/planning` et de `/activite/natations`, aucun depuis les feuilles de saisie |
| Pistes, jours neutralisés, piste mise en avant | `/assiduite`, feuille « Régler les pistes » ouverte par l'en-tête, deux onglets (Pistes, Jours neutralisés) |
| Cibles de poids, protéines, sucres, calories ; rappels, point du soir ; sécurité et données ; apparence ; assistance | restent dans `/reglages`, titré « Réglages » |

- **Décisions** (par défaut — la session ne pouvait pas poser de questions) : celles de la
  consigne, sans écart. En plus : le champ texte « Clé de la piste » n'a pas suivi,
  « Mettre en avant » écrit le même réglage depuis chaque piste ; la feuille des pistes a
  deux onglets, comme celle du carnet ; le mot « Objectifs » de la section restante de
  `/reglages` est laissé à M-13.
- **Un fichier, un jeton.** Chaque formulaire envoie sa `PATCH /api/settings` avec ses
  seules clés et le jeton de la lecture partagée (`features/settings/useSettingsDraft.ts`) ;
  toute écriture dans `settings.csv` — réglages, profil, rappels, « Mettre en avant » —
  invalide les trois lectures du fichier (`afterSettingsFileWrite`). Avant le lot, écrire un
  objectif n'invalidait pas le profil : l'enregistrement suivant du profil partait en `409`.
  `routes/SettingsFile.test.tsx` tient un faux serveur à jeton unique qui refuse un jeton
  périmé : séances → profil → séances (montés ensemble, puis visités l'un après l'autre),
  routine → courses, « Mettre en avant » → routine, et un conflit qui remonte sans
  nouvel essai. Retirer l'une ou l'autre invalidation fait échouer le test (essayé).
- **`Tracks.tsx` découpé** dans `routes/assiduite/` : `Tracks` (431 lignes), `TrackForm`
  (229), `draft.ts` (69), `OffDays` (201), `TracksSheet` (59). Ses trois `marginTop: 14`
  sont `--s4` (et `--s5` pour le `marginBottom: 20`) ; le `CLAUDE.md` §7 a perdu ses deux
  lignes.
- **Changé en route** : supprimer une piste partait au premier appui — deux appuis ;
  l'indice du seuil de la piste eau renvoyait « en haut des réglages » — il renvoie à la
  carte Hydratation ; cinq phrases du serveur disaient « dans les réglages » pour les
  repères et l'adresse de Cadence (`af749b1`) ; l'ancre `#reperes` laissait l'écran en haut
  de page une fois sur trois, la page grandissant après le défilement (`38fa723`).
- **En option, fait** (`6c2e003`) : la carte Agenda de `/planning` se replie une fois
  reliée (état, créneaux, « Modifier ») ; « Oublier le lien » demande deux appuis ; la carte
  dit sa panne au lieu de passer pour « non reliée ».
- Hauteurs à 402 px, banc semé pour le lot (celui de M-03 et M-05, plus une séance Cadence,
  son adresse et une plage neutralisée), avant → après, rempli puis vide : `/reglages`
  9 847 → 4 771 et 9 785 → 4 771 ; `/assiduite` 4 221 → 4 225 (les deux) ; `/routine`
  1 633 → 1 706 (les deux) ; `/activite/courses` 3 755 → 3 920 et 874 → 874 ;
  `/activite/seances` 1 183 → 1 266 et 1 386 → 1 552 ; `/planning` 2 987 → 2 969 et
  2 494 → 2 562 ; `/planning/sigles` 2 326.

**Reste.** La fiche 24 de l'audit, second volet (prévenir avant de quitter `/reglages` avec
une saisie non enregistrée), n'a pas été reprise : la page est devenue courte et sa barre
collante suffit à la voir. Les formulaires déplacés n'ont pas de barre collante — ce sont
deux champs au plus, sous leur bouton.

<a id="m-05"></a>

### M-05 — Profil et carnet au même endroit

**Fusionner · P3 · Assistant, Réglages**

**Constat.** Ce que l'assistant sait de toi vit en deux morceaux : le carnet (notes
datées, que le serveur remplit aussi) dans une feuille de `/assistant`, le profil stable
dans `/reglages`. L'en-tête du profil se définit d'ailleurs par contraste avec le carnet.

**Raison.** Quand l'assistant propose une séance avec du matériel qu'on n'a pas, on ouvre
`/assistant` → Mémoire pour corriger — et le matériel n'y est pas.

**Ce qui change.** La feuille « Ce que l'assistant sait de toi » prend deux onglets :
**Profil** et **Carnet**. C'est la partie « profil » de M-04.

**Coût.** Front seul. **Risque.** Aucun.

**Fait le 26 octobre** (`58cf652`), après un découpage sans changement de comportement :
`Assistant.tsx` faisait 852 lignes, ses deux feuilles sont sorties dans
`routes/assistant/` (`ea1aeb4`).

- **Décisions** (par défaut) : un `Segmented` en tête de la feuille, **Carnet** ouvert par
  défaut — l'en-tête « Mémoire » ouvre le carnet ; `?ouvre=memoire` ouvre le carnet,
  `?ouvre=profil` le profil. Le profil garde son bouton « Enregistrer le profil » sous
  `If-Match`, aucune écriture à la frappe. Aucun lien ne menait au profil dans
  `/reglages` : rien à rediriger.
- `Profile` a déménagé tel quel, quatre états compris ; seul son trait de section « Ce que
  je suis » est parti, l'onglet le porte. Les deux panneaux restent montés tant que la
  feuille est ouverte : un brouillon de profil survit à un coup d'œil au carnet. L'en-tête
  de la feuille change de phrase avec l'onglet, à hauteur égale — les segments ne bougent
  pas sous le doigt (mesuré à 360, 390 et 402 px).
- **Les invalidations**, vérifiées côté serveur : écrire le profil invalide les réglages
  (même fichier, `settings.csv`, même jeton). Rien d'autre : le condensé n'est jamais en
  cache à l'écran, le coach de course ne lit pas le profil, le compositeur de séances le
  lit à la demande.
- **Coût réel** : une phrase serveur en plus. La consigne du modèle (`context.py`), quand
  rien n'existe avec le matériel déclaré, envoyait vers « Réglages, section Ce que je
  suis » ; elle envoie vers « l'assistant : Mémoire, onglet Profil ». En route, l'indice
  de la piste eau disait « il se règle dans le profil » — déjà faux, l'objectif d'eau est
  dans « Objectifs » ; il le dit.
- `/reglages` : 11 235 → 9 785 px rempli, 11 060 → 9 785 vide. `audit-surfaces` gagne la
  ligne « profil de l'assistant » : sans défaut, comme le carnet, à 402, 390 et 360 px, en
  sombre et en clair.

<a id="m-06"></a>

### M-06 — « Tendance » et « Entraînement » quittent l'accueil

**Supprimer · P2 · Accueil**

**Constat.** Sous « Où je vais », l'accueil porte encore une courbe à treize métriques
(poids, hydratation, protéines, calories, trois volumes, six mensurations) et deux cartes
d'entraînement (huit semaines en minutes, répartition par sport). Chacune redit un autre
écran : le poids `/corps`, l'eau `/routine`, les calories `/nutrition`, le volume
`/charge`. Les mensurations, elles, n'ont de courbe *que* là.

**Raison.** Le matin, l'accueil répond à « qu'est-ce que je fais aujourd'hui » ; ses deux
tiers du bas répondent à « comment ça a évolué », que chaque écran de domaine sait mieux
dire. L'accueil passerait de 2 847 px à environ 1 700, et l'on n'y défilerait plus que
pour la forme et l'objectif.

**Ce qui change.** « Tendance » et « Entraînement » sont retirés de l'accueil. Les
mensurations gagnent leur courbe sur `/corps` (M-08). Le volume va à `/charge` (M-07).

**Coût.** Front : retirer deux blocs ; le contrat `AGG-01` continue de livrer `series` et
`training` tant qu'on ne nettoie pas le serveur — le faire dans un second temps, et dire
que `GET /api/aggregates/series` et `/metrics` n'ont alors plus d'appelant à l'écran.

**Risque.** C'est le seul endroit qui croise des métriques de domaines différents
(« poids et calories sur trois mois ») ; il disparaît. Si ce croisement sert, le garder
sur `/charge` ou `/corps` plutôt que sur l'accueil.

**Fait le 26 octobre** (`c67f06f`), avec M-07. Les blocs cités étaient exacts ; la courbe
des mensurations était sur `/corps` depuis `ae706b7`, rien ne s'est perdu.

- **Décision** (par défaut) : le croisement de métriques ne va nulle part — poids et
  mensurations sont sur `/corps`, l'eau sur `/routine`, les calories sur `/nutrition`,
  le volume sur `/charge`.
- **Changé en route** : `GET /api/aggregates/series` **garde** un appelant — la courbe des
  mensurations de `/corps` (M-08) —, contrairement à ce que disait le coût.
- **Ce qui n'a plus d'appelant à l'écran**, laissé au serveur (décision par défaut : ne
  rien supprimer) :
  - `GET /api/aggregates/metrics` (le catalogue du sélecteur de métriques) ;
  - les paramètres `metric` et `range` de `GET /api/aggregates/dashboard` ;
  - dans `DashboardView` : `series`, `training.weeks`, `training.split`,
    `training.sessions_total`, `training.minutes_total` (`training.week` sert encore la
    tuile « Semaine ») — avec `highlight` et `streak.last_seven`, déjà sans lecteur.

  Les retirer touche le contrat `AGG-01` et ses tests : un lot serveur à part.
- L'accueil passe de 3 198 à 2 207 px rempli, de 2 529 à 1 919 vide (banc du 26 octobre,
  voir le `README`).

<a id="m-07"></a>

### M-07 — Le volume hebdomadaire n'a qu'une maison

**Fusionner · P2 · Accueil, Activité, Charge**

**Constat.** Six lectures du volume par semaine : « Huit dernières semaines » et
« Répartition » (accueil), trois métriques de la Tendance (accueil), « Volume par semaine »
et « Charge par semaine » (`/activite/courses`), « Les quatre dernières semaines »
(`/activite/natations`), « Huit semaines, par sport » (`/charge`).

**Raison.** Aucune ne contredit les autres, mais aucune ne se suffit : il faut trois
écrans pour savoir combien on a fait la semaine dernière, tous sports confondus.

**Ce qui change.** `/charge` est la maison du volume **tous sports**. Les pages Courses et
Natations gardent le volume **de leur sport** (km, mètres), qui est leur sujet. L'accueil
garde sa tuile « Semaine », un chiffre, et plus de barres (M-06).

**Coût.** Front, avec M-06. **Risque.** Aucun.

**Fait le 26 octobre** (`c67f06f`), avec M-06 : l'accueil ne garde que la tuile
« Semaine ». Rien n'a changé sur `/charge`, Courses ni Natations.

- **Décision** (par défaut) : la répartition par sport sur huit semaines (carte
  « Répartition » de l'accueil) **part** — `GET /api/training` ne la sert pas ; il sert,
  par semaine, les minutes de chaque sport et leur phrase, que « Huit semaines, par
  sport » affiche déjà.
- **Reste.** Une répartition par sport sur la période (séances et minutes) n'existe plus à
  l'écran. Si elle manque, elle s'ajoute au service de `/api/training`, pas au client.

<a id="m-08"></a>

### M-08 — Corps : des mensurations corrigeables, les douleurs à leur adresse

**Ajouter (P1) · déplacer (P2) · Corps**

**Constat.**

1. Une mensuration ne se corrige ni ne se supprime : le serveur a
   `PATCH` et `DELETE /api/body/measurements/{id}` et livre l'historique
   (`MeasurementView.entries`), l'écran ne montre que la dernière valeur de chaque
   indicateur.
2. `/corps` fait 6 168 px et porte trois sujets : poids (chaque matin), mensurations
   (chaque mois), douleurs (après une sortie, et chaque matin pendant un épisode). Les
   douleurs — le bloc que lisent le coach, le matin et le soir — arrivent en dernier.

**Raison.** (1) Le projet n'a aucune annulation : une faute de frappe sur un tour de taille
reste pour toujours, et nourrit la courbe de l'accueil. (2) Pendant un épisode de douleur,
c'est elle qu'on vient voir chaque jour, pas le poids.

**Ce qui change.**

1. **P1** — Un historique des mensurations sous leur formulaire, avec corriger (même
   formulaire, comme les pesées) et supprimer (`SwipeRow`). Leur courbe, qui quitte
   l'accueil (M-06), arrive ici.
2. **P2** — Les douleurs passent à `/corps/douleurs`, une sous-page comme celles
   d'Activité, avec un lien en tête de `/corps` qui affiche l'épisode ouvert s'il y en a
   un. Les alertes de l'accueil et le matin y mènent.

**Coût.** (1) Front seul : les routes existent. (2) Front : une route et un déplacement de
`PainSection` ; les liens des alertes (`alert.url`, servis) à vérifier côté serveur.

**Risque.** (1) `If-Match` sur deux nouvelles écritures : réemployer le motif des pesées.
(2) Aucun sur les données.

**Point 1 fait le 22 octobre** (`ae706b7`). Les lignes citées étaient exactes ; `api.ts`
avait déjà `deleteMeasurement`, pas `updateMeasurement`.

- **Ce qui est là.** Une section `routes/body/Measurements.tsx` (Body.tsx passe de 607 à
  454 lignes) : « Où j'en suis » (tuiles et courbe), le formulaire — « Nouveau relevé » ou
  « Corriger le relevé du … » —, l'historique (10 relevés, puis « Toutes (N) », qui
  demande le plafond serveur de 500). Corriger reprend le formulaire comme les pesées ;
  supprimer reprend `SwipeRow` avec la puce « corriger » du Dossier.
- **Une correction remplace la ligne.** Une case vidée part à `null` (c'est ce qui
  efface), la note — que le formulaire ne montre pas — repart telle quelle. Un relevé
  neuf n'envoie que ce qui est rempli.
- **La courbe** vient de `GET /api/aggregates/series` (clé = nom de colonne). Des puces
  pour les seules mesures relevées, la première par défaut dans l'ordre servi, plage
  « Tout » seule : des relevés mensuels sur un mois font un point.

**Changé en route.** L'ancien panneau n'avait ni attente ni erreur : en panne, six tuiles
vides se lisaient comme des mesures jamais prises. La section a ses quatre états, la
courbe aussi (une série en panne n'est pas « un seul relevé »). Vus à l'écran : le titre
du formulaire passait sous la barre du haut après « corriger » (marge de défilement), et
la règle « Douleurs » collait à la carte d'avant (`.rule:first-child`, défaut antérieur).

**Reste.**

- ~~**La courbe de l'accueil** (« Tendance », ses six métriques de mensurations) est
  toujours là : c'est la session 5 (M-06) qui la retire.~~ Retirée (`c67f06f`).
- ~~**Point 2** (les douleurs à `/corps/douleurs`) : non fait, comme prévu.~~ Fait
  (`cdeda08`), ci-dessous.
- La note d'un relevé se lit à l'historique mais ne se saisit ni ne se corrige à l'écran
  (le formulaire n'a jamais eu ce champ).
- Mensurations par l'assistant : toujours absentes (M-10 les laisse attendre).

**Point 2 fait le 26 octobre** (`cdeda08`).

- **Ce qui est là.** `/corps/douleurs` (`routes/body/Pains.tsx`), rangée comme les
  sous-pages d'Activité : déclarée dans `App.tsx`, sans entrée de navigation, « Retour au
  corps », le bouton système « précédent ». `PainSection` y garde ses quatre états, perd
  sa règle de tête et gagne « En cours » et « Refermées ». En tête de `/corps`, une porte
  (`PainLink`) qui nomme chaque épisode ouvert, l'état servi et le suivi dû — ou « Aucune
  douleur en cours », ou le message du serveur en panne : la porte reste.
- **Ce qui y mène.** La porte ; les trois alertes de douleur de l'accueil (arrêt, retour,
  pattern) et le rappel de suivi de midi, dont le serveur servait `/corps` et sert
  maintenant `/corps/douleurs` (`alerts.PAIN_PAGE`). Aucun autre lien ne menait à la
  section. Le parcours du matin et le point du soir gardent leurs formulaires.
- **Décisions** (par défaut) : l'adresse et le titre « Douleurs » ; aucune entrée dans
  « Plus » ni dans la barre (M-12, M-13).
- **Vérifié à l'écran.** Un appui sur l'alerte « Douleur qui revient » arrive sur la
  sous-page. Le liseré de `SwipeRow` (`e1a0a1c`), remesuré à la nouvelle adresse : zéro
  pixel teinté au bord droit des trois premières lignes, à 360, 390 et 402 px, dans les
  deux thèmes, en émulation tactile — la sonde, éprouvée sur un bouton rouge, le voit.
- **Changé en route.** `STATUS` (le mot et le ton d'un épisode) est passé dans
  `body/shared.ts` : exporté de `Pain.tsx` pour la porte, il coûtait le rechargement à
  chaud. `audit-mobile.mjs` gagne l'adresse ; aucune feuille ne change de contenu, la
  table `SURFACES` ne bouge pas.
- `/corps` passe de 5 926 à 4 540 px rempli (avant M-09), la sous-page fait 1 905 px
  remplie, 874 vide.

<a id="m-09"></a>

### M-09 — FC de repos et VFC relues en série

**Ajouter · P2 · Corps (ou Charge)**

**Constat.** Le parcours du matin demande chaque jour FC de repos et VFC. Elles ne se
relisent nulle part : ni liste, ni courbe, ni métrique de « Tendance ». Elles ne
reparaissent qu'en une ligne sur la page d'une course (« Le matin ») et dans la phrase de
disponibilité. Une valeur du jour ne se corrige qu'en rouvrant le parcours.

**Raison.** Ce sont les deux chiffres qui disent la récupération ; on les note pour voir
leur tendance, et cette tendance n'existe à l'écran que dans la tête du serveur.

**Ce qui change.** Une carte « Le matin » — courbe des deux mesures sur 30 jours, la
référence en construction (« encore 8 matins », déjà servie), la liste avec corriger.
Sa place : `/corps`, à côté du poids qu'on note au même moment, plutôt que `/charge`.

**Coût.** Serveur : `GET /api/body/morning` sert-il une série ? À vérifier ; sinon une
lecture à ajouter au service. Front : une carte.

**Risque.** Ne pas tracer de référence tant qu'elle se construit : un tiret et ce qu'il
manque, comme ailleurs.

**Fait le 26 octobre** (`96d81d9`).

- **Le serveur.** `GET /api/body/morning` ne servait pas de série : `recent`, les quatorze
  derniers matins, et une référence pour le seul jour mesuré. Comme `MorningView` est
  aussi embarquée dans `/api/morning` (le parcours), la série est une lecture à part :
  `GET /api/body/morning/trend` — trente jours, aujourd'hui compris ; par mesure, les
  points, la **ligne de référence** (celle qu'`assess` aurait lue chaque matin), la
  référence du jour et sa phrase ; les matins de la fenêtre, du plus récent au plus
  ancien. `readiness.reference()` partage la fenêtre d'`assess`.
- **La référence.** La ligne n'est servie que si **chaque** point a la sienne : pendant la
  construction, aucune ligne, et la phrase dit ce qu'il manque (« Ta référence se
  construit : encore 5 matins »), mesure par mesure — la FC peut être prête avant la VFC.
  Une ligne trouée se serait lue comme une référence qui s'effondre.
- **L'écran.** « Le matin », sous les indicateurs du poids : un segment FC de repos /
  VFC, la courbe, la phrase servie, puis la liste. « corriger » ouvre le formulaire (date,
  FC, VFC ; une case vidée part à `null`) ; `SwipeRow` supprime en deux appuis — la route
  existait. Les deux sous `If-Match`, et l'invalidation du parcours, du coach et de la page
  d'une course. Pas de formulaire d'ajout : la porte d'un matin est le parcours.
- **Vérifié à l'écran**, au doigt : une FC corrigée de 52 à 51, un matin supprimé après
  armement ; le liseré, zéro sur dix-huit bords.
- **Reste.** La liste ne montre que la fenêtre : un matin de plus de trente jours ne se
  corrige plus à l'écran (le parcours ne rouvre que le jour même). Il ne compte plus dans
  aucune référence, qui s'arrête à 28 jours ; si le besoin vient, « Tous (N) » comme aux
  mensurations.

<a id="m-10"></a>

### M-10 — Douleur, natation, effort perçu par l'assistant

**Ajouter · P2 · Assistant**

**Constat.** L'assistant sait écrire treize actions (pesée, eau, supplément, repas,
course, séance Cadence, planning) ; il ne sait noter ni une **douleur**, ni une
**natation**, ni un **effort perçu**, ni une **mensuration**. La douleur dictée existe
déjà, mais dans `PainForm`, sur `/corps`.

**Raison.** « J'ai eu mal au genou gauche à la fin, 4 sur 10 » et « 1 500 m ce midi,
400 CR EF puis du dos » sont exactement ce qu'on dit plutôt que de le taper. Et
l'effort perçu est ce qui fait entrer une séance dans la charge (M-02).

**Ce qui change.** Trois actions de niveau « s'exécute et s'annule » : `pain.add`,
`swim.add` (dans la notation, lue par le serveur comme la saisie), `effort.rate` (sur une
séance du jour). Les mensurations peuvent attendre.

**Coût.** Serveur : trois `ActionSpec` dans `actions.py`, leur annulation, et le condensé
qui doit nommer les séances du jour pour `effort.rate`. Le jeu d'évaluation (`make eval`)
à étendre — **appels payants**.

**Risque.** Une douleur notée par erreur oriente le coach dès le lendemain : l'annulation
dans le fil doit être aussi visible que pour une pesée.

**Décision du 27 octobre** (session 9 c). **Quatre** actions et non trois : noter une
douleur (`pain.add`), noter une natation **dans la notation** (`swim.add`, lue par le
serveur comme la saisie), noter un effort perçu sur une séance **du jour**
(`effort.rate`), et `meal.add` pour **hier** — le reste de M-01. Les cas de `make eval`
s'écrivent et **ne se lancent pas** : ce sont des appels payants.

**Fait le 28 octobre** (session 9 c ; `21fb4f4`, `84977aa`, `26b8e68`, `388937f`, `0c4c28d`). Seize actions au catalogue — les treize,
plus `pain.add`, `swim.add` et `effort.rate` ; `meal.add` a gagné `day`.

- **`meal.add` pour hier** : `day` relu par `resolve_day`, l'heure du type marquée non
  relevée, le résumé dit « journal d'hier ». Pour hier, le type est l'un des quatre ou
  l'action est refusée — le défaut de la 4 b ne revient pas par le modèle.
- **`pain.add`** réemploie `PainPayload` et `PainService.create`. Le condensé nomme le
  `pain_id` des épisodes ouverts. Trois bornes au serveur : le jour ou la veille
  seulement (un relevé rangé après coup changerait la « hausse » qu'a lue le coach), la
  zone passée au filtre de diagnostics de la dictée (`names_a_diagnosis`), la provenance
  `ia` (valeur nouvelle de `pain.csv`). `run_id` est tu au modèle. La règle d'`IA-12`
  garde sa phrase et nomme l'exception : « hormis la noter avec pain.add si je te demande
  de la noter ».
- **`swim.add`** : `SwimPayload` lu par `SwimService.create`, le chemin de la saisie. La
  notation arrive au fil ordinaire par une tranche, `notation_natation` ; une notation
  fautive relance le modèle une fois, comme au planning, sinon le refus porte
  `swim_notation_invalid` — `ActionReport.code` est nouveau, et tout refus en porte un.
- **`effort.rate`** : course, natation, sortie, séance Cadence ; séance du jour seulement,
  vérifié au serveur. Sur une séance sans effort, elle s'exécute et « Annuler » remet
  l'effort à vide — `Undo` a gagné `method`, `suffix`, `body`, dont les défauts gardent les
  six usages en `DELETE`. Sur une séance qui en a un, elle attend (`confirm_if`, lu sur la
  donnée). Le condensé nomme les séances du jour : sorte, ligne, jeton, effort noté ou non.
- Une réponse qui a écrit relit tous les écrans sauf le fil ; l'annulation suit le geste
  rendu par le serveur. L'écran n'apprend aucune des quatre par son nom.
- **make eval** : huit cas écrits (`repas-hier`, `repas-hier-sans-type`, `douleur-ajout`,
  `douleur-suivi`, `douleur-il-y-a-trois-jours`, `natation-ajout`, `effort-du-jour`,
  `effort-seance-hier`), **jamais lancés** ; `tests/test_evals_cases.py` vérifie sans modèle
  qu'ils se chargent.

**Changé en route.**

- Les séances Cadence portaient un `rpe` sans route pour le noter après coup :
  `PUT /api/activity/sessions/{id}/rpe`, sous `If-Match`, ajoutée.
- La notation n'entre pas d'office dans le fil ordinaire (un test l'exige) : une tranche, et
  la relance du planning réemployée.
- Vu sur le banc et corrigé (`0c4c28d`) : l'invalidation après une réponse relisait le fil
  ouvert, qui affichait le tour deux fois ; et « Douleur notée — Douleur (genou…) »
  répétait la phrase des règles.

**Reste** : au §7.

<a id="m-11"></a>

### M-11 — L'état vide de l'accueil ouvre « Noter »

**Corriger · P3 · Accueil**

« Aucun relevé aujourd'hui » propose « Noter une pesée » (→ `/corps`) et « Boire un verre »
(→ `/routine`). La feuille « Noter » fait les deux sans changer d'écran. Un bouton
« Noter » qui l'ouvre vaut mieux que deux navigations. Front seul.

<a id="m-12"></a>

### M-12 — Des groupes « Plus » qui suivent la journée

**Déplacer · P3 · Plus**

Les groupes actuels (Mesurer / Décider / Regarder en arrière) rangent Nutrition sous
« Décider », l'eau et le dossier médical sous « Mesurer ». Proposition : **Chaque jour**
(Nutrition, Routine, Corps), **Prévoir** (Planning, Plan de course, Objectif), **Relire**
(Charge, Assiduité), **Référence** (Dossier médical, Réglages). Front seul ; à refaire
après M-13 pour les libellés.

**Fait le 26 octobre** (`64e3f49`), après M-13. Les quatre groupes de la proposition, dans
cet ordre ; Déconnexion rejoint « Référence ». Les libellés des entrées ne changent pas
(« Hydratation & suppléments » reste, par défaut). La barre du haut sur ordinateur suit le
même ordre — Corps remonte après Routine ; la barre d'onglets du bas ne bouge pas. Un test
d'écran fige l'ordre des groupes et de leurs entrées. Regardée à 402, 390 et 360 px, en
sombre et en clair : aucune cible sous 44 px, aucun débordement ; « Référence » est sous
le pli, comme « Compte » l'était.

<a id="m-13"></a>

### M-13 — Un mot, un sens

**Renommer · P2 · toutes**

**Constat.** Cinq mots servent à deux ou trois choses :

| Mot | Sens à l'écran |
|---|---|
| Objectif | l'objectif daté (`/objectif`) ; les cibles quotidiennes (« Objectifs & repères », `/reglages`) ; « objectif 2 400 kcal » (`/nutrition`) |
| Planning | le calendrier (`/planning`) ; la liste des suppléments (`/routine`, carte « Planning ») |
| Charge | la charge d'entraînement (`/charge`) ; les poids des exercices (`/activite/charges`) ; la charge de course (`/activite/courses`) |
| Course | une sortie (« Enregistrer une course ») ; une compétition (« Ajouter une course » sur `/plan`) |
| Coach | le coach de course (`CoachCard`) ; « Le coach du planning » (un fil d'assistant) |

**Raison.** Deux boutons « Ajouter une course » qui n'écrivent pas la même chose, une
« Charge » dans « Plus » et une « Charges » sous Activité : on hésite à chaque fois, et
l'assistant reçoit les mêmes mots.

**Ce qui change.** Proposition, à valider mot par mot :

- « Cibles » pour les valeurs quotidiennes de `/reglages` ; « Objectif » reste à
  l'objectif daté.
- « Mes suppléments » pour la carte de `/routine`.
- « Poids des exercices » (ou « Charges Cadence ») pour `/activite/charges`.
- « Course visée » partout sur `/plan` (« Ajouter une course visée »).
- « Coach » pour le seul coach de course ; le fil de `/planning` devient « Demander au
  planning » (ou disparaît, M-20).

**Coût.** Front : libellés, et les tests qui les cherchent par leur nom. **Risque.** Les
tests d'écran cherchent souvent par libellé : prévoir le temps de les reprendre.

**Fait le 26 octobre**, un commit par mot, avec les choix par défaut (la session ne posait
pas de questions) ; seuls les libellés changent, ni adresses, ni identifiants, ni colonnes.

| Mot | Devenu | Commit |
|---|---|---|
| Objectif (valeur quotidienne) | **Cible** : la section « Cibles » de `/reglages` ; « Écart à la cible » et « cible 70 kg » sur `/corps` ; « cible 150 g », « cible 2 400 kcal » sur `/nutrition` et son historique ; « Cible du jour », « Cible 2 L · raccourcis… », « cible atteinte » sur `/routine` ; « cible 2 L » dans « Noter » | `21a1672` |
| Planning (suppléments) | **Mes suppléments** sur `/routine` : titre, « Ajouter le supplément », « Retirer … de mes suppléments », toasts, état vide « Aucun supplément » | `0e51542` |
| Charges | **Poids des exercices** : titre de `/activite/charges` et lien d'en-tête de `/activite` ; dans la page, le nom commun suit (« Poids », « Aucun poids noté », « Remettre un poids ») | `d654526` |
| Course (compétition) | **Course visée** partout sur `/plan` ; « A — l'objectif » devient « A — la principale » ; le surtitre « Course à pied » (`827b293` : « Courses visées » répétait le trait de section) | `6f53740`, `827b293` |
| Coach du planning | **Demander au planning** ; le champ dit « Ta demande » ; « Coach » ne désigne plus que le coach de course | `c2f44fa` |

- **Le serveur suit** là où il rédige une phrase que l'écran affiche : la piste eau suit « la
  cible d'hydratation » ; « Ce supplément n'est pas dans ta liste. » ; le conflit de deux
  courses dit « toutes deux classées A » ; la note du jour de course posée par le plan dit
  « priorité A ». **Son préfixe « Course : » ne bouge pas** : c'est le marqueur par lequel le
  coach reconnaît le jour de course et ne le déplace jamais (`planning/replan.py`). Le
  condensé de l'assistant dit « coach de course » pour les décisions et la séance du coach,
  pour que le modèle — à qui la consigne dit « Tu es le coach personnel… » — ne s'en croie
  pas l'auteur.
- **Laissés** : la consigne « Tu es le coach personnel de cette application » (une décision
  de ton, pas un libellé) ; le groupe « Chargés » de `/activite/charges` ; les notes de jour
  de course déjà posées, qui gardent « objectif A » (des données écrites) ; la vitrine.
- **Le coût vu** : « Poids des exercices » passe sur une seconde rangée dans l'en-tête de
  `/activite` (+58 px, voir le `README`). Les autres écrans touchés gardent leur hauteur.
- Regardés sur le banc à 402 px, sombre et clair, rempli et vide : `/reglages`, `/corps`,
  `/nutrition`, `/routine`, `/activite`, `/activite/charges`, `/plan`, `/planning`, et
  « Noter ».

<a id="m-14"></a>

### M-14 — La carte « Import d'une capture » est un doublon

**Supprimer · P2 · Activité**

**Constat.** L'étape 1 de « Enregistrer une course » lit une capture Apple Fitness. En bas
de `/activite`, la carte « Import d'une capture » (`AppleImport`, 645 lignes) fait la même
chose, par un autre parcours en quatre étapes.

**Raison.** Deux portes pour le même geste, dont une en bas d'un écran de 3 470 px. On
n'enregistre pas une course deux fois de deux façons.

**Ce qui change.** La carte part. Ce qu'`AppleImport` fait de plus — plusieurs captures à la
fois, l'étape « vérifier ce qui part » — est repris dans l'étape 1 de la feuille si l'usage
le demande.

**Coût.** Front : retirer un composant et ses tests (`Activity.import.test.tsx`), après
avoir vérifié que la feuille couvre ce qui compte. **Risque.** Perdre l'import
multi-captures : vérifier d'abord s'il sert.

**Fait le 22 octobre** (`ded7779`). Les lignes citées étaient exactes (645 lignes).

- **Ce que la carte faisait et pas la feuille** — treize points, dont sept **champs lus
  puis jetés** : la feuille lisait la même capture mais écrivait par `createRun`, sans
  dénivelé, calories actives et totales, heures de début et de fin, longueur des paliers
  ni paliers, et en `source=manual`. Puis ce qu'elle disait : champs absents, relecture
  des paliers, doublon probable, capture lue comme une séance ; « Pas d'accord » ; la
  durée lisible ; l'allure lue retenue à côté de la distance (fiche 02 de l'audit) ; une
  date non lue laissée vide (la feuille posait aujourd'hui) ; la réduction à 0,92.
- **Tout est porté dans l'étape 2**, qui passe par `importsApi.confirm` quand une capture
  a été lue ; dénivelé et calories ne s'y demandent qu'alors. **Décision par défaut** : une
  capture suffit — l'envoi de plusieurs à la fois n'a pas suivi.
- Changé en route : l'étape 2 s'ouvrait à la position de défilement de l'étape 1, la
  phrase sur ce qui manquait au-dessus du bord (`scrollSheetTop`, sorti de `MealDetail`
  dans `lib/scroll.ts`) ; les nombres lus s'écrivaient « 44.2 ».
- **Reste.** La date, le temps et l'allure lus ne portent pas la marque « proposée » :
  ce sont des `Field`, pas des `Stepper` — la phrase de l'`AiBlock` ne parle que des
  champs en pointillé. Défaut hérité de la feuille, laissé.

<a id="m-15"></a>

### M-15 — Une natation `.fit` mène à ses natations

**Corriger · P2 · Activité**

**Constat.** Une natation déposée dans « Enregistrer une course » est reconnue, écrite,
puis l'écran part sur `/planning?jour=…`
([`NewActivitySheet.tsx:276`](../../frontend/src/routes/activity/NewActivitySheet.tsx#L276)),
et la note de la feuille l'annonce : « Une natation en piscine va au planning ». C'est une
trace d'avant `/activite/natations`.

**Ce qui change.** La feuille ouvre la natation importée dans `SwimSheet` (comme `Swims`),
sur place ; la note se corrige.

**Coût.** Front seul. **Risque.** Aucun.

**Fait le 22 octobre** (`9f1e991`). La ligne citée était exacte. La feuille rend la
natation à l'écran qui l'ouvre (`onSwimImported`) — `/activite` et `/activite/courses`,
qui monte la même feuille. **Changé en route** : depuis `/activite/courses`, `SwimSheet`
n'avait pas « Réécrire en notation » (pas d'`onEdit`) ; la page monte maintenant
`SwimEntrySheet`, comme `Swims`.

<a id="m-16"></a>

### M-16 — Un vélo ou une marche saisis à la main

**Ajouter · P3 · Activité**

Vélo et marche n'entrent que par un `.fit`. `activityApi.createOther` et
`POST /api/activity/others` existent, sans écran. Une option « Autre sortie » dans
« Enregistrer une course » (sport, durée, distance, effort) suffit. À faire si l'usage
existe : sans montre, ces sorties sont aujourd'hui invisibles à la charge globale.

**Décision du 27 octobre** (session 9 a). Saisie à la main : **sport, date, durée,
distance facultative, et l'effort perçu demandé dans le même formulaire** — facultatif,
avec la phrase qui dit que sans lui la sortie ne compte pas dans la charge. La saisie se
range dans la feuille « Course », étape 1, en troisième choix « Vélo ou marche, à la
main ». La liste des sports vient du serveur ; aucune n'est écrite côté client.

**Fait le 27 octobre** (`2cc88e0`, `7eaa41f`). **Changé en route** : le coût annoncé
« front seul » ne tenait pas — `OtherPayload` n'acceptait pas l'effort perçu et aucune
route ne servait les sports. Le serveur prend `rpe` et lit durée et distance comme une
course (`1h30`, `12,5`) ; `GET /api/activity/others` sert `sports`, tirés du `Literal`
du schéma. L'échelle de `RateEffort` est sortie en `EffortScale`, contrôlée : un second
appui retire la note. La feuille s'intitule « Vélo ou marche » à l'étape 2. Vu sur le
banc : le bouton principal disait « Saisir à la main » juste sous « Vélo ou marche, à la
main » — il dit maintenant « Saisir une course à la main ». Une sortie de 1 h 05 à
l'effort 5 entre à `/charge` pour 325.

**Reste.** Une sortie saisie ne se **corrige** pas : `OtherSheet` ne note que l'effort,
et le serveur n'a pas de `PATCH /others/{id}` — une durée fausse se supprime et se
ressaisit. Aucune douleur n'est demandée après la saisie (`PainCheck`), comme pour une
course à la main ; seul un import la pose. La FC moyenne et la note, que la route
accepte, ne sont pas demandées.

<a id="m-17"></a>

### M-17 — Corriger une course visée

**Ajouter · P3 · Plan**

`PATCH /api/races/{id}` (« Corriger une course visée ») existe, sans écran : changer un
chrono visé ou une date oblige à supprimer puis recréer, ce qui défait le plan posé. Un
« corriger » sur la ligne, réemployant le formulaire d'ajout. Front seul.

**Décision du 27 octobre** (session 9 a). Corriger une course visée **en place**, par le
formulaire d'ajout, sous `If-Match`. Si la **date** change alors que son plan est posé au
planning, la correction s'enregistre, puis un bandeau dit que le plan posé ne suit plus
et offre « Reposer le plan », **armé, deux appuis**, puisqu'il remplace. C'est le
serveur qui dit que le plan ne suit plus — aucune comparaison de dates à l'écran.

**Fait le 27 octobre** (`defb1cd`). **Changé en route** : le coût annoncé « front seul »
ne tenait pas non plus — rien ne retenait pour quelle date un plan avait été posé.
`races.csv` gagne `plan_date` (dernière colonne, vide par défaut), écrite par « Poser »,
effacée par « Retirer » ; `GET /api/races` sert `stale_plan` (la course, la phrase) quand
elle diffère de la date et que des séances `plan` restent à venir. Un plan posé avant la
colonne se reconnaît, à la correction, par son jour de course posé (le marqueur
« Course : ») à l'ancienne date. Un conflit de jeton ne se force pas : le message passe
en toast et la correction se referme — le formulaire, remonté sur le nouveau jeton,
aurait emporté le message. Vu sur le banc : « Distance » et « Priorité » prennent
l'intitulé d'un `Field`.

**Reste.** Seule la **date** rend le plan caduc. Une course A passée en B garde son plan
posé sans bandeau ; un nom corrigé laisse l'ancien titre au jour de course posé jusqu'à
la repose ; une course retirée laisse ses séances `plan`. La liste des distances
(`DISTANCES` dans `Plan.tsx`) est toujours écrite côté client, comme l'étaient les
sports avant M-16.

<a id="m-18"></a>

### M-18 — La synchro Garmin à l'écran

**Ajouter · P3 · Réglages**

`GET /api/sync` (état) et `POST /api/sync` (synchroniser maintenant) existent ; on ne les
lit qu'au terminal (`make status`, `make sync`). Une ligne dans Réglages — dernière synchro,
ce qu'elle a apporté, un bouton — dirait pourquoi la nuit de l'accueil manque. **Appel
Garmin réel** au bouton : à annoncer comme tel.

**Décision du 27 octobre** (session 9 b) : **écartée, sans code.** L'utilisateur ne veut
**aucune synchro Garmin, même en production**. Il n'y a donc rien à montrer : ni état, ni
bouton. Les sorties entrent par leur `.fit`, la nuit par le parcours du matin (FC de
repos, VFC), comme aujourd'hui. Le code de la synchro reste en place — `domains/sync/`,
son planificateur, `make sync` — : le retirer est un lot à part, que personne n'a demandé
(§7).

<a id="m-19"></a>

### M-19 — La course A dans « Où je vais »

**Ajouter · P3 · Accueil, Objectif, Plan**

Une course A datée est l'objectif le plus concret de l'application ; « Où je vais » n'en
dit rien et montre, faute d'objectif, une cible de poids qu'il présente lui-même comme
n'en étant pas un. Proposition : la prochaine course A (nom, J-n, phase du plan) s'affiche
dans « Où je vais », avant la cible de poids. Serveur : l'ajouter au tableau de bord
(`AGG-01`). Décision de produit : un objectif daté et une course A peuvent coexister —
lequel passe devant ?

**Décision du 27 octobre** (session 9 b). « Où je vais » montre **les deux** : la course A
d'abord (nom, J-n, phase du plan), l'objectif daté dessous ; la cible de poids seulement à
défaut des deux.

**Fait le 28 octobre** (`af2202d`). `DashboardView.race` (`RaceAim`, dans `races/schemas.py`,
qui importe `Race` et `StalePlanView`) porte la course, le « J-n » ou « Jour J », l'état du
plan (`absent`, `posed`, `stale`) et la phrase de sa phase, rédigés au serveur. **Changé
en route** : la phase ne vient pas de `GET /api/races/plan/{id}`. Recalculé chaque jour, ce
plan part du lundi suivant et répartit ses phases sur ce qui reste — sa première semaine
dit presque toujours « base », et la semaine en cours n'y est jamais. La phase est celle du
plan **posé** : chaque séance posée écrit « semaine i/n, phase. » dans sa note, et le
serveur la relit (`periodize.placed_note` / `read_placed_note`, côte à côte). La semaine de
la pose n'a pas de séance : la phrase dit alors « Semaine 1 sur 16 — base, à partir du
02/11 ». Un plan qui ne suit plus ne montre **aucune** phase, seulement la phrase de M-17
et « Voir le plan ». L'état vide offre aussi « Viser une course ». Une lecture de
`races.csv`, une du planning (déjà tiré pour la prochaine séance), aucune des décisions de
conflit : un test le compte sur une requête froide. Vu sur le banc : les deux cartes se
collaient, le pied de carte serrait la phrase, les deux liens de l'état vide se calaient à
gauche — corrigés avant le commit.

<a id="m-20"></a>

### M-20 — Un seul coach sur le planning

**Fusionner · P3 · Planning**

`/planning` porte deux coachs : un fil d'assistant (« Le coach du planning », tourné vers la
natation par ses suggestions) et la carte du coach de course. Garder la carte, qui est
le coach ; le fil devient une entrée « Demander au planning » qui ouvre l'assistant sur ce
fil (et ce fil apparaît enfin dans « Tes discussions »,
[`service.py:194`](../../backend/app/domains/assistant/service.py#L194)). Décision de
produit : le fil du planning a des actions réservées (`plan.propose`) ; les ouvrir au fil
ordinaire ou garder la portée.

**Décision du 27 octobre** (session 9 c). Le fil « Demander au planning » **se fond dans
l'assistant** : une entrée sur `/planning` ouvre l'assistant sur ce fil, le fil apparaît
dans « Tes discussions », et ses actions réservées (`plan.propose`) **gardent leur
portée** — elles ne s'ouvrent pas au fil ordinaire.

**Fait le 28 octobre** (session 9 d) : `685c4af` (la confirmation dans la portée de son fil),
`bbacdd7` (l'entrée, le fil dans l'assistant, le retour).

- **Vérifié avant de bâtir.** Ce que la 9 c avait établi tient : le fil est listé
  (« planning · »), seul `_resumable` l'écarte de la reprise, `ask()` relit la portée du fil.
  **Sauf `confirm()`**, qui validait sans portée : un `plan.propose` se confirmait depuis un
  fil ordinaire ou sans fil — refait sur le banc avant correction (200, deux séances
  écrites). Corrigé à part (`685c4af`) : `thread_id` obligatoire (absent, 422 ; inconnu,
  404), validation dans la portée du fil, et l'inverse tenu aussi (une suppression de pesée
  refusée dans le fil du planning). Trois tests.
- **`/planning`.** `PlanningChat` (235 lignes), ses trois classes et ses cinq tests partent ;
  une carte « Demander au planning » mène à `/assistant?portee=planning`, sans rien lire.
  La carte du coach de course reste, inchangée. 2 766 → 2 307 px rempli, 2 562 → 2 331 vide.
- **Le cas sans fil** — décision (par défaut) : une **portée dans l'adresse**, pas un
  identifiant. L'assistant demande `GET /threads/planning` ; s'il rend un fil, il l'ouvre,
  sinon la première question part avec `scope: "planning"` et c'est le serveur qui ouvre le
  fil. Écarté : un fil créé à l'appui de l'entrée — il laisserait un fil vide à chaque
  visite, ce que `ask()` évite exprès.
- **Dans le fil du planning** : titre « Planning », une mention en tête (ce que fait le fil,
  **Voir le planning**), et les trois débuts de question au-dessus de la saisie, champ vide.
  Aucun des trois dans un fil ordinaire ; un fil du planning rouvert depuis la feuille les
  retrouve, la portée se lisant sur lui.
- **Le retour** : `ActionReport.day`, le premier jour écrit par une adoption, servi par le
  serveur ; la carte adoptée offre **Voir au planning** → `/planning?jour=…`, que `/planning`
  lisait déjà. Éprouvé au toucher sur le banc : le jour s'ouvre, la séance adoptée y est.
- **Invalidation.** Rien à déplacer : c'est `ProposalCard` qui invalide tout à l'adoption
  (planning, `CROSS_CUTTING`), sous `PlanningChat` comme dans l'assistant. `PlanningChat` lui-même
  n'invalidait que `keys.assistant.all()` en vidant le fil — geste parti avec lui, que la
  feuille des fils porte (« Supprimer », deux appuis).
- **En route** : la feuille « Tes discussions » ne voyait pas un fil qu'une réponse venait
  d'ouvrir. L'invalidation de M-10 (`0c4c28d`) épargne tout ce qui commence par `assistant`,
  la liste comprise ; avec 30 s de fraîcheur, le fil neuf manquait. La liste se relit seule
  (`exact`), le fil ouvert toujours pas. Et le titre d'un fil neuf restait « Nouvelle
  discussion » après sa première réponse ; il prend celui que la réponse rend.
- **`ActionCard` reconnaît encore `plan.propose` par son nom** — pas aggravé : le retour suit
  `day`, les suggestions suivent la portée du fil. Il faudrait le corriger (`sessions` non vide
  suffit), sans décision ; laissé au §7.

<a id="m-21"></a>

### M-21 — Quatre phrases fausses ou illisibles

**Corriger · P1 · Charge, Activité**

Relevées en regardant les pages, hors de toute fiche :

1. `/charge`, sans aucune séance : « **Toutes les séances des 4 semaines ont un effort
   perçu.** » Vrai au sens logique, lu comme une mesure — l'invariant « aucune valeur
   inventée ». Le serveur doit taire la phrase quand il n'y a aucune séance.
2. Feuille « Course », étape 1 : « Aujourd'hui : **2026-10-22** », en ISO
   ([`NewActivitySheet.tsx:662`](../../frontend/src/routes/activity/NewActivitySheet.tsx#L662)).
3. `/activite/courses` vide : « Importe le fichier .fit de ta montre **depuis
   l'activité** », sous un bouton « Ajouter une course » qui le fait (aussi dans
   `sortie-publique.md` §4.17).
4. Le commentaire de [`Dashboard.tsx:319`](../../frontend/src/routes/Dashboard.tsx#L319)
   dit que la barre du haut n'a pas d'entrée Assistant ; elle en a une depuis `320bcfc`. Un
   commentaire faux justifie un bloc qui ne l'est plus (M-22).

**Coût.** Une ligne chacun, un test pour le premier. **Risque.** Aucun.

**Fait le 22 octobre** (`3bcde3f`). Les quatre lignes citées étaient exactes.

- (1) `banister._unrated_text` rend une phrase vide quand la fenêtre de 28 jours ne
  contient **aucune** séance — y compris quand les seules séances sont plus anciennes.
  En route : `Load.tsx` dessinait la phrase sans garde dans la carte « Forme et fatigue »,
  un paragraphe vide y serait resté ; il ne s'affiche plus que non vide, comme dans
  « Rapport et monotonie ». Deux tests serveur (le modèle, et `GET /api/training` sur un
  stockage vide).
- (2) `longDate(today)` : « Aujourd'hui : jeudi 22 octobre », comme l'accueil, Nutrition
  et Routine. Une assertion d'écran.
- (3) « « Ajouter une course », en haut de page : le fichier .fit de ta montre, ou les
  chiffres à la main. » Une assertion d'écran.
- (4) Commentaire seul : il dit que la barre du haut a son entrée depuis `320bcfc` et
  renvoie à M-22.

**Reste.** Les deux « depuis l'activité » de `/activite/course` sont laissés : la page
n'a pas de bouton d'ajout, la phrase y est juste. La phrase de forme sur zéro séance
(« aucune séance n'a d'effort perçu ») a le même biais, plus faible — elle suppose des
séances — et n'a pas été touchée. `sortie-publique.md` §4.17 n'a pas été mis à jour.
~~La phrase de forme~~ corrigée avec M-02 (`3930cfb`) : sans aucune séance, « aucune séance
enregistrée » ; la phrase d'avant revient dès qu'une séance existe sans effort perçu.

<a id="m-22"></a>

### M-22 — La rangée « Assistant » en pied d'accueil

**Supprimer · P3 · Accueil**

Trois liens (Ouvrir l'assistant, Discussions, Mémoire) existaient parce que l'ordinateur
n'avait pas d'entrée Assistant. Il en a une, la barre basse aussi ; le seul qui apporte
quelque chose est « Mémoire », et c'est déjà un bouton de l'en-tête de `/assistant`. La
rangée part.

**Fait le 26 octobre** (`fc178f8`). La rangée, son trait de section et sa classe partent.
**Décision** (par défaut) : `?ouvre=discussions` et `?ouvre=memoire` restent lus par
`/assistant` — un favori ou un lien gardé y mène encore. `/` : 2 223 → 2 070 px rempli,
1 919 → 1 766 vide.

<a id="m-23"></a>

### M-23 — Les favoris dans la feuille « Ajouter un repas »

**Déplacer · P2 · Nutrition, Noter**

**Constat.** « Rejouer » un favori est sur la page, sous l'historique, à environ 2 800 px
du haut. La feuille « Ajouter un repas » — là où l'on va pour noter — a trois modes et pas
celui-là. Et la carte Favoris porte en permanence un formulaire de création, alors que la
fiche d'un repas sait déjà « Ajouter aux favoris » d'un appui.

**Raison.** Le petit-déjeuner de tous les jours est le repas le plus fréquent et le plus
court à noter ; il est aujourd'hui le plus loin.

**Ce qui change.** La feuille s'ouvre sur une rangée de favoris (un appui = rejoué) au-dessus
des trois modes. La carte Favoris de la page devient une liste à gérer (retirer) ; le
formulaire de création part, la fiche d'un repas restant la porte d'entrée. « Ajouter un
repas » dans « Noter » ouvre la feuille directement, comme « Noter une séance » ouvre
déjà le formulaire (fiche 25 de l'audit).

**Coût.** Front seul (`POST /api/nutrition/favorites/{id}/replay` existe). **Risque.** Un
favori sans description ne peut plus être créé à la main ; c'est déjà la règle de la fiche.

**Fait le 22 octobre** (`34bbce7`), avec le rejeu daté (reste de M-01) — qui a touché le
serveur, contrairement au coût annoncé.

- **Décisions** (par défaut) : tous les favoris, dans une `ChipStrip`, dans l'ordre servi ;
  un appui rejoue et ferme la feuille, sans confirmation. Le **jour** se choisit dès
  l'étape du mode — un favori n'a pas de formulaire où le dire ensuite — et reste en tête
  du formulaire, sur le même état. « Noter » mène à `/nutrition?ajout=repas` ; toute
  valeur d'`ajout` ouvre la feuille, `hier` impose hier.
- La carte Favoris de la page perd **« rejouer »** et le formulaire : elle ne fait plus que
  retirer. Vide, elle nomme la fiche d'un repas.
- La phrase d'en-tête ne dit plus « rien n'est enregistré avant ta validation » quand un
  favori est là : l'appui écrit.
- ~~**Reste.** Un favori rejoué prend le type de l'heure présente (`suggested_type`) : un
  dîner rejoué pour hier à 8 h part en petit-déjeuner.~~ Fait (`d1de02d`) : pour hier, la
  feuille demande le type, et le serveur l'exige. La fiche d'un repas d'hier s'ouvre
  depuis le journal d'hier (`74dfc9d`) — voir M-01.

---

## 4. Ce qui est déjà décidé ailleurs

| Document | Recoupement |
|---|---|
| [`AUDIT.md`](../../AUDIT.md) et [`correctifs-audit.md`](../correctifs-audit.md) | Rien de reproposé. M-11 et M-23 prolongent la fiche 25 (« Noter » ouvre le formulaire). La fiche 13 (séance muscu depuis des notes) reste une décision de produit ; M-10 en est voisin sans la trancher. La fiche 24, second volet (prévenir avant de quitter `/reglages`), se pose autrement depuis M-04 : non repris, voir la fiche. |
| [`sortie-publique.md`](../sortie-publique.md) | §4.14 (`/reglages` fait 7 794 px — 11 357 à l'inventaire) : M-04 en était la cause et la réponse ; 4 771 depuis. §4.17 : M-21 (3). §4.3, §4.4, §4.5 (couleurs, représentations, dates) : de la forme, non repris ici. §3.2 (le matin qui prend l'application en otage) : non repris — il vise un public. |
| [`charge-multisport.md`](../charge-multisport.md), [`accueil-et-charge.md`](../accueil-et-charge.md) | M-02 rouvre la cohabitation des deux charges qu'ils ont posée ; la relire avant de trancher le seuil. |
| [`refonte-activite.md`](../refonte-activite.md) | M-14 et M-15 n'y touchent pas aux phases 4 et 6 (suppression de CSV, à la main). |
| `CLAUDE.md` §7 | `Tracks.tsx` (840 lignes) à découper : fait avec M-04 (`4d902ce`), dans `routes/assiduite/`, et ses trois styles en ligne avec ; les deux lignes du §7 sont parties. `Planning.tsx` n'en faisait plus que 210 — la ligne était périmée, corrigée avec M-03 ; c'est `Assistant.tsx` (852) qu'il a fallu découper, avant M-05 (`ea1aeb4`). |

## 5. Dans quel ordre

1. ~~**M-21** — une heure, et l'écran ne dit plus rien de faux.~~ Fait (`3bcde3f`).
2. ~~**M-01** et **M-08 (1)** — les deux trous qui salissent des données qu'on ne peut pas
   défaire.~~ Faits (`331ae7e`, `ae706b7`) ; `meal.add` fait avec M-10 (`21fb4f4`).
3. ~~**M-02 (1–3)** — après avoir tranché le seuil de facile.~~ Fait (`385871a`,
   `1fa151b`) ; le point 4 reste un lot à part.
4. ~~**M-23**, **M-15**, **M-14** — Nutrition et Activité, front seul.~~ Faits (`34bbce7`,
   `9f1e991`, `ded7779`), avec deux restes de M-01 (`7c895ff`) et le liseré de `SwipeRow`
   (`e1a0a1c`) ; puis le journal d'hier et le type d'un favori rejoué (`74dfc9d`, `d1de02d`).
   Reste à part : ouvrir un jour depuis la grille de l'historique.
5. ~~**M-06 + M-07** ensemble, puis **M-08 (2)** et **M-09** — l'accueil allégé, le corps
   réorganisé.~~ Faits (`c67f06f`, `cdeda08`, `96d81d9`).
6. ~~**M-03**, puis **M-04** + **M-05** + **M-22** — le grand rangement des réglages.~~
   Faits (`c9b1433`, `58cf652`, `fc178f8`, puis M-04 en cinq commits, `96f1f8f` →
   `4d902ce`), après le découpage d'`Assistant.tsx` (`ea1aeb4`).
7. ~~**M-13** et **M-12** à la fin, quand les écrans ont trouvé leur place : renommer avant
   de déplacer ferait renommer deux fois.~~ Faits (`21a1672` → `c2f44fa`, `827b293`, puis
   `64e3f49`).
8. **M-10**, **M-16** à **M-20** : décisions prises le 27 octobre (sous chaque fiche).
   Session 9 a : ~~**M-16** et **M-17**~~ faits (`2cc88e0`, `7eaa41f`, `defb1cd`).
   Session 9 b : ~~**M-19**~~ fait (`af2202d`) ; **M-18** écartée sans code (`9e75cd0`).
   Session 9 c : ~~**M-10**~~ fait (`21fb4f4`, `84977aa`, `26b8e68`, `388937f`, `0c4c28d`) ; **M-20** passe à la session 9 d.
   Session 9 d : ~~**M-20**~~ fait (`685c4af`, `bbacdd7`).
9. **Les restes du §7**, décisions du 28 octobre (colonne du §7, et M-02 point 4 sous sa
   fiche). Session 10 a : **M-11** et les restes qui se corrigent sans décision. Session
   10 b : la douleur après une saisie à la main, la correction d'un vélo ou d'une marche, le
   plan caduc d'une course passée en B ou retirée, l'adoption rangée dans son fil, la doc
   d'`IA-12`. Session 10 c : M-02 point 4. Session 10 d : le retrait de la synchro Garmin.

## 6. Écarté, et pourquoi

- **Fusionner Routine dans Accueil.** La ligne « Il reste aujourd'hui » et « Noter »
  couvrent les gestes ; mais la liste des suppléments, leurs cadences et l'historique
  d'eau ont besoin d'une page. La redondance actuelle est de celles qui font gagner un
  geste.
- **Fusionner Planning et Plan de course.** Une fois M-03 fait, `/plan` ne porte plus que
  ce qui lui est propre (courses visées, plan périodisé), et `/planning` le calendrier. Les
  fondre referait une page de 4 000 px.
- **Fusionner Charge et Assiduité** (« Regarder en arrière »). L'une mesure l'effort,
  l'autre le respect d'un engagement ; `/assiduite` le dit en tête d'écran. Les mêler
  ferait lire du rouge là où il n'y a que du gris.
- **Retirer l'effort perçu de certains écrans.** Six endroits le demandent ; c'est le même
  geste là où l'on se trouve, et il est sous-renseigné (M-02). En retirer serait le
  contraire de ce qu'il faut.
- **Fusionner les trois pages de la carte du coach.** Elle s'affiche au matin, au planning
  et sur la page d'une course, par une seule implémentation : trois moments, une
  composante. C'est la bonne forme de redondance.
- **La synchro Garmin à l'écran (M-18).** Par décision de l'utilisateur, le 27 octobre :
  pas de synchro Garmin, même en production. Un état et un bouton « Synchroniser
  maintenant » montreraient une voie qu'on a choisi de ne pas prendre.
- **Un écran « Santé » rassemblant Corps, Dossier et douleurs.** Tentant, mais le dossier
  est une référence chiffrée qu'on ouvre deux fois par an, et le poids un geste de chaque
  matin. M-08 sort les douleurs de `/corps` sans créer d'écran de plus.

## 7. Ce qui reste — à reprendre pour lui-même

Les restes des fiches faites avant le 27 octobre sont sous chaque fiche, en **Reste.**
Ceux des sessions 9 a à 9 d sont rassemblés ici, pour qu'aucune ne les reprenne en passant.

**Les décisions du 28 octobre** (de l'utilisateur, relayées par le superviseur) sont dans la
dernière colonne, avec la session qui les prend : 10 a (cette clôture), 10 b, 10 c, 10 d.
« Aucune à prendre » : le reste se corrige sans décision de produit. « — » : rien n'a été
décidé, le reste attend tel quel. Celle du point 4 de M-02 est sous sa fiche.

| Reste | Pourquoi laissé | Décision du 28 octobre |
|---|---|---|
| Corriger une sortie vélo ou marche (durée, sport, distance) | pas de route `PATCH /others/{id}` ; une addition se défait par le glissement de l'historique | hors de la liste ; laissé à la **session 10 b**, avec la douleur demandée après la saisie |
| La douleur après une sortie saisie à la main | une course à la main ne la demande pas non plus ; l'étendre aux deux est une décision | **demandée**, comme après un import, pour la course, le vélo et la marche — **session 10 b** |
| Un plan posé pour une course passée de A en B, ou retirée | M-17 ne vise que la date ; la priorité et la suppression défont aussi le plan, autrement | **dit par le serveur**, comme pour la date ; « Reposer le plan » ou « Retirer le plan », armés — **session 10 b** |
| `DISTANCES` écrite dans `Plan.tsx` | même défaut que les sports avant M-16 ; le serveur a `catalog.SPECS`, il pourrait la servir | aucune à prendre : se corrige — session 10 a |
| Aucune des deux saisies essayée sur un vrai téléphone | `CLAUDE.md` §7 — le banc émule le toucher, pas le clavier système | — |
| Le code de la synchro Garmin (`domains/sync/`, son planificateur, `make sync`, la ligne Garmin de `make status` et `make doctor` ; `garminconnect` n'est importé que s'il est installé, et ne l'est pas) | M-18 est écartée : aucune synchro, même en production. Le retirer — ou le garder dormant — est une **décision à prendre** ; la session 9 b n'y a pas touché | **retiré** ; le décodeur `.fit` et l'import à la main restent — **session 10 d** |
| La phase lue dans la note d'une séance posée (M-19) | une note récrite à la main perd sa phase (les autres séances de la semaine la portent encore) ; une séance déplacée d'une semaine à l'autre garde celle de sa semaine d'origine. Une colonne `plan_week` serait plus solide — une colonne de plus pour un cas qu'on n'a pas vu | **gardée** : pas de colonne `plan_week` |
| `/objectif` ne dit rien de la course A | M-19 vise « Où je vais » ; la page de l'objectif chiffré reste la sienne | **attend** |
| Le jour J et le lendemain vus sur le banc | l'horloge du banc est la vraie ; couverts par les tests à date fixe (`test_m19_race_day_then_the_day_after`) | — |
| Deux liens « Détail » dans « Où je vais » (course et objectif), même nom pour un lecteur d'écran | ils mènent à `/plan` et `/objectif` ; un `aria-label` distinct serait le geste, pas fait en passant | aucune à prendre : se corrige — session 10 a |
| L'anneau de l'objectif à « 0 % » sous « 2 sur 3 séances » (vu sur le banc) | antérieur à M-19 : le ratio se compte depuis la base relevée à l'adoption, égale ici au relevé actuel. À relire si la lecture trompe | aucune à prendre : le regarder, et ne le changer que si c'est l'affichage — session 10 a |
| Les huit cas M-10 de `make eval` jamais joués | décision du 27 octobre : appels payants. Le premier `make eval` dira ce que valent la consigne et les quatre actions. `need_contient` lit la dernière passe seulement : il ne prouve pas qu'une tranche a été demandée | **pas lancés** |
| `charge-lundi` sert trois tranches que l'application n'a plus (`progression_charges`, `detail_seances`, `exercices`) | trouvé par `test_evals_cases.py` (M-10) ; antérieur, depuis la refonte de l'activité. Reprendre ce cas — ou le retirer — est une décision sur lui ; la liste est figée et ne peut que rétrécir | aucune à prendre : le cas se **réécrit** sur les tranches actuelles, sans être lancé — session 10 a |
| Une natation notée par l'assistant est `source=manual` (« saisie »), pas `ia` | `swims.csv` ne connaît que `fit` et `manual`, et seule une `manual` se corrige d'un bloc : une valeur `ia` la rendrait incorrigible sans toucher à `SwimService.update` et à l'écran. Décision de schéma | **gardée** en `manual` |
| Une douleur notée par l'assistant n'est rattachée à aucune sortie | `run_id` est tu au modèle, qui ne voit aucun identifiant stable de sortie ; les patterns (R4) ne la lient donc à rien. Servir les identifiants stables du jour le permettrait | — |
| Une douleur de plus d'un jour ne se note pas par l'assistant | borne voulue (M-10) : elle se note sur `/corps`, date choisie à l'écran | — |
| Les mensurations par l'assistant | la fiche les laissait attendre ; `measurements.csv` n'a toujours pas de colonne `source` | **attendent** |
| `ActionReport.code` n'est lu par aucun écran | le code voyage depuis M-10 ; l'écran affiche la phrase et ne décide encore de rien sur un refus | aucune à prendre : un refus au moins se décide sur le code — session 10 a |
| `ActionCard` reconnaît `plan.propose` à son nom | antérieur : la seule action dont l'écran dessine une carte à part ; « `sessions` non vide » suffirait. M-20 ne l'a pas aggravé (le retour suit `day`) ; se corrige sans décision | aucune à prendre : se corrige — session 10 a |
| « La table refuse `plan.*`… quand la question porte une alerte médicale » (`assistant-agent.md` §4) | introuvable dans le code au 28 octobre : la garde d'`IA-12` est dans la consigne seule. Antérieur à M-10, noté pour être tranché | **corriger la doc** : la garde est la consigne seule, et c'est assumé — **session 10 b** |
| Aucune des quatre actions essayée sur un vrai téléphone, ni avec un vrai modèle | `CLAUDE.md` §7 ; le banc sert des réponses écrites à la main | — |
| Une adoption n'est pas rangée dans le fil (M-20) | rouvert, le fil du planning montre la réponse sans « 2 séances ajoutées » : `confirm()` écrit au planning, pas au fil. Antérieur (`planning-natation.md` §9) ; l'écrire au fil demande de rattacher une confirmation à son message | **oui**, elle s'y range — **session 10 b** |
| Le refus hors portée nomme l'action (« « plan.propose » n'est pas quelque chose que je sais faire ») | la phrase de `validate()` pour un nom inconnu, antérieure ; vue dans un fil ordinaire sur le banc. Dire le geste plutôt que le nom se corrige sans décision | aucune à prendre : dire le geste — session 10 a |
| `day` n'est servi que par `plan.propose` | `plan.add` et `plan.move` écrivent aussi au planning, sans lien de retour. Les étendre est une ligne chacun ; M-20 ne visait que le fil du planning | aucune à prendre : se corrige — session 10 a |
| Un fil ouvert par `?fil` n'a ni attente ni erreur | antérieur : pendant la lecture, et si elle échoue, l'écran dit « Pose ta question : le fil commence ici » au-dessus d'un fil qui existe. M-20 n'a dessiné les deux états que pour la recherche du fil du planning | aucune à prendre : se corrige — session 10 a |
| Le fil du planning jamais essayé sur un vrai téléphone, ni avec un vrai modèle | `CLAUDE.md` §7 ; les propositions du banc sont écrites à la main | — |

