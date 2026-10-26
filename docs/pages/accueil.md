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
| **Il reste aujourd'hui** (`Today`) | Eau, protéines, suppléments : fait / cible, et la phrase du restant. Puis la prochaine séance prévue (dans les 14 jours). Alerte « plafond de sucres dépassé » | `GET /api/aggregates/dashboard` (`day`, `next_session`, `nutrition`) | « Aucun relevé aujourd'hui » + deux liens **Noter une pesée** (→ `/corps`) et **Boire un verre** (→ `/routine`) ; « Aucune séance prévue d'ici deux semaines » |
| **Bande de trois chiffres** | Poids (dernier, variation sur N pesées), semaine (durée, séances, km), assiduité (série, record, jours suivis) | même appel (`weight`, `training.week`, `streak`) | Tirets et phrase du prochain geste |
| **Forme** (`Shape`) | Alertes ouvertes (critique / à voir / pour info), phrase de forme et de rapport de charge, relevé de la nuit (Garmin) | `GET /api/notifications/alerts`, `GET /api/training`, `GET /api/body/health` | Chaque ligne a sa panne propre ; la nuit ne s'affiche que s'il y en a une |
| **Où je vais** (`Aim`) | L'objectif en cours (anneau, résumé, fenêtre, jours restants) ; à défaut la cible de poids ; à défaut l'état vide | même appel (`goal`, `weight.to_target_kg`) | « Aucun objectif en cours » + **Fixer un objectif** |
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
`/objectif`, `/corps` et `/routine` (état vide), `/assistant` par la lecture du jour seule
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
- **L'état vide envoie ailleurs ce que « Noter » fait sur place.** « Noter une pesée » et
  « Boire un verre » mènent à `/corps` et `/routine`, alors que la feuille « Noter »
  enregistre les deux sans changer d'écran.
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
ouverte ; une nuit Garmin ; les deux parcours en situation (le banc tournait à 13 h, hors
des deux fenêtres) — ils sont décrits depuis le code.
