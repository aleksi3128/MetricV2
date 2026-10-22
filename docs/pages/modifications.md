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
| Mensurations | L (courbe) | — | — | — | — | — | — | — | L É (courbe, historique, correction — M-08) | — | — | — | — |
| FC de repos, VFC | L (nuit) | L (page course) | — | — | — | — | — | — | — | — | — | — | É (matin) |
| Douleur | L (alertes) | É (après import) | — | — | — | — | — | — | L É | L (frise) | — | — | É |
| Eau | L ×2 | — | É | — | L É | — | — | — | — | — | L | R | É |
| Suppléments | L | — | É | — | L É R | — | — | — | — | — | L | — | É |
| Protéines, calories | L ×2 | — | É | L É | — | — | — | — | — | — | — | R | — |
| Séance prévue | L | L (respect) | É | — | — | L É | É (plan) | — | — | — | — | — | L |
| Proposition du coach | — | L (page course) | — | — | — | L | — | — | — | — | — | — | L (matin) |
| Effort perçu | — | É ×4 | — | — | — | — | — | — | — | L | — | — | É |
| **Charge d'entraînement** | L (forme) | **L (course, FC)** | — | — | — | — | — | — | — | **L (tous sports, RPE)** | — | — | — |
| **Volume hebdomadaire** | **L ×2** | **L ×3** | — | — | — | — | — | — | — | **L** | — | — | — |
| Facile / modéré / dur | — | L (constat, 14 j — M-02) | — | — | — | — | — | — | — | L (80 %, 28 j) | — | — | — |
| Objectif daté | L | — | (condensé) | — | — | — | — | L É | — | — | — | — | — |
| Course visée (A/B/C) | — | — | — | — | — | — | L É | — | — | — | — | — | — |
| Agenda iCloud, changements du coach | — | — | — | — | — | — | L É | — | — | — | — | — | L É (soir) |
| Ce que l'assistant sait de toi | — | — | L É (carnet) | — | — | — | — | — | — | — | — | É (profil) | — |
| Séances Cadence | — | L É | É | — | — | — | — | — | — | — | L (séries) | R (adresse) | — |

Trois lignes portent l'essentiel : **la charge** (deux calculs, deux verdicts), **le
volume hebdomadaire** (six lectures sur trois écrans), et **ce que l'assistant sait de
toi** (deux endroits). Trois autres montraient des trous : les mensurations et la FC du
matin s'écrivaient sans se relire — les mensurations se relisent depuis M-08 —, la course
visée ne parle à aucun autre écran.

---

## 2. Synthèse

| Id | Sorte | Pages | En une ligne | Prio. |
|---|---|---|---|---|
| [M-01](#m-01) | ajouter | Nutrition, matin, assistant | Noter un repas d'hier — **fait** (`331ae7e`), sauf l'assistant | **P1** |
| [M-02](#m-02) | fusionner | Activité (courses), Charge, Accueil | Une seule règle du facile — **fait** (`385871a`, `1fa151b`), sauf le point 4 | **P1** |
| [M-08](#m-08) | ajouter, déplacer | Corps | Mensurations corrigeables — **fait** (`ae706b7`) ; les douleurs à leur adresse | **P1** / P2 |
| [M-21](#m-21) | corriger | Charge, Activité | Quatre phrases fausses ou illisibles relevées en passant — **fait** (`3bcde3f`) | **P1** |
| [M-23](#m-23) | déplacer | Nutrition, Noter | Les favoris dans la feuille « Ajouter un repas » | P2 |
| [M-03](#m-03) | déplacer | Plan, Planning | L'agenda et « ce que le coach a changé » au planning | P2 |
| [M-04](#m-04) | déplacer | Réglages et six écrans | Chaque réglage à côté de l'écran qu'il règle | P2 |
| [M-06](#m-06) | supprimer | Accueil | « Tendance » et « Entraînement » quittent l'accueil | P2 |
| [M-07](#m-07) | fusionner | Accueil, Activité, Charge | Le volume hebdomadaire tous sports n'a qu'une maison : `/charge` | P2 |
| [M-09](#m-09) | ajouter | Corps (ou Charge) | FC de repos et VFC relues en série | P2 |
| [M-10](#m-10) | ajouter | Assistant | Douleur, natation, effort perçu par l'assistant | P2 |
| [M-13](#m-13) | renommer | toutes | « Objectif », « Planning », « Charge », « Course », « Coach » : un mot, un sens | P2 |
| [M-14](#m-14) | supprimer | Activité | La carte « Import d'une capture », doublon de l'étape 1 | P2 |
| [M-15](#m-15) | corriger | Activité | Une natation `.fit` mène à `/activite/natations`, pas au planning | P2 |
| [M-05](#m-05) | fusionner | Assistant, Réglages | Profil et carnet au même endroit | P3 |
| [M-11](#m-11) | corriger | Accueil | L'état vide ouvre « Noter » au lieu de changer d'écran | P3 |
| [M-12](#m-12) | déplacer | Plus | Des groupes qui suivent les moments de la journée | P3 |
| [M-16](#m-16) | ajouter | Activité | Un vélo ou une marche saisis à la main | P3 |
| [M-17](#m-17) | ajouter | Plan | Corriger une course visée | P3 |
| [M-18](#m-18) | ajouter | Réglages | L'état de la synchro Garmin à l'écran | P3 |
| [M-19](#m-19) | ajouter | Accueil, Objectif, Plan | La course A dans « Où je vais » | P3 |
| [M-20](#m-20) | fusionner | Planning | Un seul coach sur le planning | P3 |
| [M-22](#m-22) | supprimer | Accueil | La rangée « Assistant » en pied d'accueil | P3 |

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

- **`meal.add` de l'assistant** (M-10) : le service accepte déjà `day="yesterday"`, il
  suffit de le passer depuis l'`ActionSpec` et de nommer le champ dans son schéma ; la
  phrase « noter un repas **du jour** » est à changer avec.
- **Rejouer un favori** se date toujours de l'instant ; si M-23 met les favoris dans la
  feuille, le rejeu devra recevoir le jour choisi (`replay_favorite` ne le prend pas).
- **La fiche d'un repas** ne corrige toujours pas l'heure ni le jour.
- **Aucun écran ne montre l'heure** d'un repas d'hier : le journal et sa fiche ne lisent
  que la journée. C'est voulu — une heure posée n'a pas à passer pour une mesure —, mais
  à garder en tête le jour où la fiche s'ouvrira depuis l'historique.

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
| Ce que je suis (profil) | `/assistant`, à côté du carnet (M-05) |
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

- **La courbe de l'accueil** (« Tendance », ses six métriques de mensurations) est
  toujours là : c'est la session 5 (M-06) qui la retire. Rien ne manque plus si elle part.
- **Point 2** (les douleurs à `/corps/douleurs`) : non fait, comme prévu.
- La note d'un relevé se lit à l'historique mais ne se saisit ni ne se corrige à l'écran
  (le formulaire n'a jamais eu ce champ).
- Mensurations par l'assistant : toujours absentes (M-10 les laisse attendre).

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

<a id="m-16"></a>

### M-16 — Un vélo ou une marche saisis à la main

**Ajouter · P3 · Activité**

Vélo et marche n'entrent que par un `.fit`. `activityApi.createOther` et
`POST /api/activity/others` existent, sans écran. Une option « Autre sortie » dans
« Enregistrer une course » (sport, durée, distance, effort) suffit. À faire si l'usage
existe : sans montre, ces sorties sont aujourd'hui invisibles à la charge globale.

<a id="m-17"></a>

### M-17 — Corriger une course visée

**Ajouter · P3 · Plan**

`PATCH /api/races/{id}` (« Corriger une course visée ») existe, sans écran : changer un
chrono visé ou une date oblige à supprimer puis recréer, ce qui défait le plan posé. Un
« corriger » sur la ligne, réemployant le formulaire d'ajout. Front seul.

<a id="m-18"></a>

### M-18 — La synchro Garmin à l'écran

**Ajouter · P3 · Réglages**

`GET /api/sync` (état) et `POST /api/sync` (synchroniser maintenant) existent ; on ne les
lit qu'au terminal (`make status`, `make sync`). Une ligne dans Réglages — dernière synchro,
ce qu'elle a apporté, un bouton — dirait pourquoi la nuit de l'accueil manque. **Appel
Garmin réel** au bouton : à annoncer comme tel.

<a id="m-19"></a>

### M-19 — La course A dans « Où je vais »

**Ajouter · P3 · Accueil, Objectif, Plan**

Une course A datée est l'objectif le plus concret de l'application ; « Où je vais » n'en
dit rien et montre, faute d'objectif, une cible de poids qu'il présente lui-même comme
n'en étant pas un. Proposition : la prochaine course A (nom, J-n, phase du plan) s'affiche
dans « Où je vais », avant la cible de poids. Serveur : l'ajouter au tableau de bord
(`AGG-01`). Décision de produit : un objectif daté et une course A peuvent coexister —
lequel passe devant ?

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

---

## 4. Ce qui est déjà décidé ailleurs

| Document | Recoupement |
|---|---|
| [`AUDIT.md`](../../AUDIT.md) et [`correctifs-audit.md`](../correctifs-audit.md) | Rien de reproposé. M-11 et M-23 prolongent la fiche 25 (« Noter » ouvre le formulaire). La fiche 13 (séance muscu depuis des notes) reste une décision de produit ; M-10 en est voisin sans la trancher. La fiche 24, second volet (prévenir avant de quitter `/reglages`), se pose autrement si M-04 est fait. |
| [`sortie-publique.md`](../sortie-publique.md) | §4.14 (`/reglages` fait 7 794 px — 11 357 aujourd'hui) : M-04 en est la cause et la réponse. §4.17 : M-21 (3). §4.3, §4.4, §4.5 (couleurs, représentations, dates) : de la forme, non repris ici. §3.2 (le matin qui prend l'application en otage) : non repris — il vise un public. |
| [`charge-multisport.md`](../charge-multisport.md), [`accueil-et-charge.md`](../accueil-et-charge.md) | M-02 rouvre la cohabitation des deux charges qu'ils ont posée ; la relire avant de trancher le seuil. |
| [`refonte-activite.md`](../refonte-activite.md) | M-14 et M-15 n'y touchent pas aux phases 4 et 6 (suppression de CSV, à la main). |
| `CLAUDE.md` §7 | `Tracks.tsx` et `Planning.tsx` à découper : M-04 et M-03 en sont l'occasion. |

## 5. Dans quel ordre

1. ~~**M-21** — une heure, et l'écran ne dit plus rien de faux.~~ Fait (`3bcde3f`).
2. ~~**M-01** et **M-08 (1)** — les deux trous qui salissent des données qu'on ne peut pas
   défaire.~~ Faits (`331ae7e`, `ae706b7`) ; `meal.add` reste pour M-10.
3. ~~**M-02 (1–3)** — après avoir tranché le seuil de facile.~~ Fait (`385871a`,
   `1fa151b`) ; le point 4 reste un lot à part.
4. **M-23**, **M-15**, **M-14** — Nutrition et Activité, front seul.
5. **M-06 + M-07** ensemble, puis **M-08 (2)** et **M-09** — l'accueil allégé, le corps
   réorganisé.
6. **M-03**, puis **M-04 + M-05 + M-22** — le grand rangement des réglages.
7. **M-13** et **M-12** à la fin, quand les écrans ont trouvé leur place : renommer avant
   de déplacer ferait renommer deux fois.
8. **M-10**, **M-16** à **M-20** : chacun quand sa décision de produit est prise.

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
- **Un écran « Santé » rassemblant Corps, Dossier et douleurs.** Tentant, mais le dossier
  est une référence chiffrée qu'on ouvre deux fois par an, et le poids un geste de chaque
  matin. M-08 sort les douleurs de `/corps` sans créer d'écran de plus.
