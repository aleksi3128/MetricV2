# Accueil — `/`

**Rôle.** L'écran qu'on ouvre le plus : ce qui reste à faire aujourd'hui, la forme du
moment, où l'on va. Il porte aussi les deux parcours guidés — le matin et le soir — qui
s'ouvrent par-dessus n'importe quel écran.

**Comment on y arrive.** Onglet « Accueil » (barre basse), entrée « Accueil » de la barre
du haut sur ordinateur, lien d'une relance du soir (`/?soir=1`).

Fichiers : [`Dashboard.tsx`](../../frontend/src/routes/Dashboard.tsx) et
[`dashboard/`](../../frontend/src/routes/dashboard/), [`MorningFlow.tsx`](../../frontend/src/routes/morning/MorningFlow.tsx),
[`EveningFlow.tsx`](../../frontend/src/routes/evening/EveningFlow.tsx),
[`CoachCard.tsx`](../../frontend/src/routes/coach/CoachCard.tsx).

---

## 1. Le tableau de bord

Haut d'écran rempli : 2 847 px à 402 px de large à l'inventaire ; 2 207 px depuis M-06
(3 198 avant, sur le banc du 26 octobre — voir le `README`) ; 2 070 depuis M-22 (2 223
avant, sur le banc du lot M-03).

| Bloc | Ce qu'il montre | Source | Vide / erreur |
|---|---|---|---|
| **Lecture du jour** (`Brief`) | Un message du modèle pour le moment de la journée (matin, mi-journée, soir), en `AiBlock` ; le condensé envoyé, replié | `GET /api/brief` | Absente : « Rien n'est encore écrit… » + **Demander la lecture**. Sans clé IA : la carte disparaît |
| **Il reste aujourd'hui** (`Today`) | Eau, protéines, suppléments : fait / cible, et la phrase du restant. Puis la prochaine séance prévue (dans les 14 jours). Alerte « plafond de sucres dépassé » | `GET /api/aggregates/dashboard` (`day`, `next_session`, `nutrition`) | « Aucun relevé aujourd'hui » + **Noter**, qui ouvre la saisie rapide sur place (M-11, `8e632c1`) — et son scan d'aliment depuis `NUT-28`, dont le repas rejoint les protéines au retour de la feuille ; « Aucune séance prévue d'ici deux semaines » |
| **Bande de trois chiffres** | Poids (dernier, variation sur N pesées), semaine (durée, séances, km), assiduité (série, record, jours suivis) | même appel (`weight`, `training.week`, `streak`) | Tirets et phrase du prochain geste |
| **Forme** (`Shape`) | Alertes ouvertes (critique / à voir / pour info), phrase de forme et de rapport de charge, relevé de la nuit | `GET /api/notifications/alerts`, `GET /api/training`, `GET /api/body/health` | Chaque ligne a sa panne propre ; la nuit ne s'affiche que s'il y en a une : la durée du sommeil saisie au parcours du matin (`c6c10b4`), ou un jour de l'archive `body/health.csv`, que plus rien n'écrit depuis `1c161e1`. Le stress et la Body Battery, sans source, ne sont pas dits |
| **Où je vais** (`Aim`) | La prochaine course A (nom, « J-n », distance, date, chrono visé, phase du plan posé — M-19, `af2202d`), puis l'objectif en cours (anneau, résumé, la phrase qui dit d'où se compte le pourcentage — `ratio_text`, `a96f83a` —, fenêtre, jours restants) ; la cible de poids seulement à défaut des deux ; à défaut l'état vide | même appel (`race`, `plan_notice`, `goal`, `weight.to_target_kg`) | Course sans plan : « Aucun plan posé » + **Poser le plan** (→ `/plan`) ; plan qui ne suit plus : la phrase du serveur + **Voir le plan**, aucune repose ici ; le plan d'une course passée en B, ou retirée, dans sa carte à part (« Plan de course », `plan_notice`, session 10 b) : la même phrase que `/plan`, **Voir le plan**, ni repose ni retrait ; rien : « Aucun objectif en cours » + **Fixer un objectif** et **Viser une course** |
| ~~**Tendance** (`Graph`)~~ | Retirée (M-06, `c67f06f`) : chacune de ses treize métriques a sa courbe sur son écran | — | — |
| ~~**Entraînement** (`Training`)~~ | Retiré (M-06, M-07, `c67f06f`) : le volume tous sports est sur `/charge`, la semaine reste en tuile | — | — |
| ~~**Assistant**~~ | Retirée (M-22, `fc178f8`) : la barre du haut et la barre basse ont leur entrée, « Mémoire » est un bouton de l'en-tête de `/assistant` | — | — |

## 2. Le parcours du matin — feuille « Bonjour »

S'ouvre seul entre 6 h et midi quand le serveur le dit dû (`GET /api/morning`) ; revient au
retour au premier plan s'il est fermé sans être fini ; une porte manuelle existe sur `/corps`.

| Étape | Ce qu'elle montre | Ce qu'elle écrit |
|---|---|---|
| La nuit | Champs FC de repos et VFC (vides, jamais préremplis) | `POST /api/body/morning` ou `PATCH …/{id}` |
| La douleur (si un épisode est ouvert) | Le suivi du matin de l'épisode, formulaire `PainForm` | `POST /api/pain` |
| La pesée | Champ poids, rappel de la dernière pesée | `POST /api/body/weight` |
| La séance | Disponibilité du jour (phrase), puis la **carte du coach** entière, ou la séance prévue | via la carte : accepter / refuser / autre proposition |
| La journée | Effort de la sortie d'hier (1–10), nombre de repas notés hier — à zéro, un lien qui ouvre la feuille d'ajout sur hier —, suppléments à cocher, séances prévues | RPE de la course ; `POST /api/supplements/today` |

Sorties : **Passer** (par étape, `POST /api/morning/pass`), **Pas ce matin** (`POST /api/morning/snooze`).

## 3. Le point du soir — feuille « Point du soir »

S'ouvre seul dans la fenêtre du soir, ou par la relance `/?soir=1`.

| Section | Ce qu'elle montre | Ce qu'elle écrit |
|---|---|---|
| Tes séances | Chaque séance du jour et son effort perçu (1–10) | RPE course / natation / autre |
| Ta douleur | `PainCheck` sur la séance du jour | `POST /api/pain` ou « aucune douleur » |
| Ce que j'ai changé | Les déplacements du coach, avec « Non, remets comme avant » — le même composant que sur `/planning` (M-03) | `POST /api/planning/changes/{key}` |
| Demain | Lignes rédigées par le serveur | — |

Sorties : **C'est noté** (`POST /api/evening/done`), **Rappelle-moi dans N min** (`POST /api/evening/snooze`).

## 4. Actions

| Action | Geste | Écrit | Garde |
|---|---|---|---|
| Demander la lecture | bouton | `POST /api/brief` (appel modèle) | addition |
| Répondre à la lecture | appui sur le corps du bloc | ouvre un fil d'assistant semé (`POST /api/brief/thread`) | addition |
| Ouvrir une ligne du jour | ligne entière | rien — navigue vers `/routine`, `/nutrition`, `/planning` | — |
| Toutes les saisies des parcours | voir §2 et §3 | — | additions, sans confirmation |

## 5. Liens sortants

`/routine` (eau, suppléments), `/nutrition` (protéines), `/planning` (séance), `/charge`,
`/objectif`, `/plan` (course A, depuis M-19 — ses deux « Détail » ont chacun leur nom accessible depuis `8e632c1`), `/assistant` par la lecture du jour seule
(la rangée de trois liens est partie avec M-22), un lien par alerte — celles de douleur
mènent à `/corps/douleurs` depuis M-08 (`cdeda08`).

## 6. Constats

- ~~**La courbe « Tendance » redouble trois écrans.**~~ Retirée (M-06, `c67f06f`) : ses
  treize métriques ont chacune leur courbe sur leur écran — poids et mensurations
  `/corps`, eau `/routine`, calories `/nutrition`, volume `/charge`.
- ~~**« Entraînement » redit `/charge`.**~~ Retiré (M-06, M-07, `c67f06f`) : le volume tous
  sports n'habite plus que `/charge` ; l'accueil garde la tuile « Semaine », un chiffre.
- ~~**Deux poids, deux variations sur le même écran.**~~ Parti avec la courbe : seule la
  bande dit la variation du poids.
- ~~**La Forme peut contredire la page Courses.**~~ En partie corrigé (M-02, `385871a`) :
  la page Courses ne conseille plus la sortie suivante, nomme sa charge « Charge de
  course (FC) » et renvoie à `/charge`. **Reste** l'écart de fond (M-02, point 4, ouvert) :
  dix courses `.fit` sans effort perçu, et l'accueil dit toujours « Pas encore de charge
  globale » pendant que la page Courses compte 310. Sans aucune séance, la phrase dit
  désormais « aucune séance enregistrée » (`3930cfb`).
- ~~**La nuit ne s'affiche pas — par choix, en attendant sa saisie.**~~ Corrigé
  (`c6c10b4`, 29 octobre) : la durée du sommeil se saisit au parcours du matin, avec la FC
  de repos et la VFC, et la ligne de `Shape` dit « Relevé du 29/10 — 7 h 12 de sommeil. »
  dès le premier matin qui en porte une. Le stress et la Body Battery n'arrivaient que par
  la synchro Garmin, retirée (`1c161e1`) : ils ne sont plus dits — ni zéro, ni tiret.
  L'archive `body/health.csv`, si elle existe, reste lue ; un jour porté par les deux prend
  la durée saisie (`synchro-garmin.md` §6, S5).
- **Le plan d'une course passée en B, ou retirée, se dit à l'accueil** (session 10 b,
  `2cfff5e`) : `DashboardView.plan_notice`, dans sa carte « Plan de course » sous la course
  A, la phrase de `/plan` et « Voir le plan ». La phrase nomme « reposer » et « retirer »,
  qui ne se font que sur `/plan` — laissé, au §7 de `modifications.md`.
- ~~**« Où je vais » ne dit rien de la course A.**~~ Corrigé (M-19, `af2202d`) : la
  prochaine course A passe en tête, avec son « J-n » et la phase du plan **posé**, lue
  par le serveur dans les notes des séances (le plan recalculé repartirait chaque jour de
  sa base). L'objectif daté vient dessous ; la cible de poids ne se montre plus qu'à
  défaut des deux.
- ~~**L'état vide envoie ailleurs ce que « Noter » fait sur place.**~~ Corrigé (M-11,
  `8e632c1`) : un bouton « Noter » ouvre la saisie rapide — la feuille du bouton central,
  dont l'état est monté dans la coquille — sans quitter l'accueil.
- ~~**L'anneau de l'objectif peut dire « 0 % » sous « 2,2 sur 3 séances »**~~ (vu le 28
  octobre). Dit (`a96f83a`, décision du 29 octobre) : la règle ne change pas, le serveur
  rédige sous l'anneau ce que compte le pourcentage et quelle était la base — « 0 % du
  chemin depuis ta base : 2,2 séances par semaine à l'adoption (…) ». La même phrase qu'à
  `/objectif` ; sans base, pas d'anneau et « Chemin fait : — », avec le relevé qui en
  donnerait une.
- ~~**La rangée « Assistant » en pied d'écran a perdu sa raison d'être.**~~ Retirée (M-22,
  `fc178f8`). Les adresses `?ouvre=discussions` et `?ouvre=memoire` restent lues par
  `/assistant`.
- ~~**Le matin promet un rattrapage qui n'existe pas.**~~ Corrigé (M-01, `331ae7e`) :
  « Aucun repas noté hier. » est suivi d'un lien « Rattraper un repas d'hier » qui ferme
  le parcours et ouvre la feuille d'ajout sur hier (`/nutrition?ajout=hier`).
- ~~**FC de repos et VFC s'écrivent chaque matin et ne se relisent nulle part.**~~ Corrigé
  (M-09, `96d81d9`) : la carte « Le matin » de `/corps` les trace sur trente jours, avec la
  référence quand elle existe, et les corrige.

## 7. Non vu

La lecture réellement écrite par un modèle (banc sans réponse de modèle) ; une alerte
ouverte ; une nuit de l'archive de la montre (aucune n'a jamais été écrite en production) ; les deux parcours en situation (le banc tournait à 13 h, hors
des deux fenêtres) — ils sont décrits depuis le code.
