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

Haut d'écran rempli : 2 847 px à 402 px de large.

| Bloc | Ce qu'il montre | Source | Vide / erreur |
|---|---|---|---|
| **Lecture du jour** (`Brief`) | Un message du modèle pour le moment de la journée (matin, mi-journée, soir), en `AiBlock` ; le condensé envoyé, replié | `GET /api/brief` | Absente : « Rien n'est encore écrit… » + **Demander la lecture**. Sans clé IA : la carte disparaît |
| **Il reste aujourd'hui** (`Today`) | Eau, protéines, suppléments : fait / cible, et la phrase du restant. Puis la prochaine séance prévue (dans les 14 jours). Alerte « plafond de sucres dépassé » | `GET /api/aggregates/dashboard` (`day`, `next_session`, `nutrition`) | « Aucun relevé aujourd'hui » + deux liens **Noter une pesée** (→ `/corps`) et **Boire un verre** (→ `/routine`) ; « Aucune séance prévue d'ici deux semaines » |
| **Bande de trois chiffres** | Poids (dernier, variation sur N pesées), semaine (durée, séances, km), assiduité (série, record, jours suivis) | même appel (`weight`, `training.week`, `streak`) | Tirets et phrase du prochain geste |
| **Forme** (`Shape`) | Alertes ouvertes (critique / à voir / pour info), phrase de forme et de rapport de charge, relevé de la nuit (Garmin) | `GET /api/notifications/alerts`, `GET /api/training`, `GET /api/body/health` | Chaque ligne a sa panne propre ; la nuit ne s'affiche que s'il y en a une |
| **Où je vais** (`Aim`) | L'objectif en cours (anneau, résumé, fenêtre, jours restants) ; à défaut la cible de poids ; à défaut l'état vide | même appel (`goal`, `weight.to_target_kg`) | « Aucun objectif en cours » + **Fixer un objectif** |
| **Tendance** (`Graph`) | Une courbe au choix parmi **13 métriques** — poids, hydratation, protéines, calories, volume hebdo, séances/semaine, distance hebdo, six mensurations — sur 1 mois, 3 mois ou tout ; dernier, variation, moyenne, amplitude | série livrée avec le tableau de bord, puis `GET /api/aggregates/series` | « Deux relevés suffisent… » |
| **Entraînement** (`Training`) | Huit dernières semaines en minutes (barres) ; répartition course / tabata / natation en séances et minutes | même appel (`training`) | « Une première séance, et l'histogramme démarre » |
| **Assistant** | Trois liens : Ouvrir l'assistant, Discussions, Mémoire | — | toujours là |

## 2. Le parcours du matin — feuille « Bonjour »

S'ouvre seul entre 6 h et midi quand le serveur le dit dû (`GET /api/morning`) ; revient au
retour au premier plan s'il est fermé sans être fini ; une porte manuelle existe sur `/corps`.

| Étape | Ce qu'elle montre | Ce qu'elle écrit |
|---|---|---|
| La nuit | Champs FC de repos et VFC (vides, jamais préremplis) | `POST /api/body/morning` ou `PATCH …/{id}` |
| La douleur (si un épisode est ouvert) | Le suivi du matin de l'épisode, formulaire `PainForm` | `POST /api/pain` |
| La pesée | Champ poids, rappel de la dernière pesée | `POST /api/body/weight` |
| La séance | Disponibilité du jour (phrase), puis la **carte du coach** entière, ou la séance prévue | via la carte : accepter / refuser / autre proposition |
| La journée | Effort de la sortie d'hier (1–10), nombre de repas notés hier, suppléments à cocher, séances prévues | RPE de la course ; `POST /api/supplements/today` |

Sorties : **Passer** (par étape, `POST /api/morning/pass`), **Pas ce matin** (`POST /api/morning/snooze`).

## 3. Le point du soir — feuille « Point du soir »

S'ouvre seul dans la fenêtre du soir, ou par la relance `/?soir=1`.

| Section | Ce qu'elle montre | Ce qu'elle écrit |
|---|---|---|
| Tes séances | Chaque séance du jour et son effort perçu (1–10) | RPE course / natation / autre |
| Ta douleur | `PainCheck` sur la séance du jour | `POST /api/pain` ou « aucune douleur » |
| Ce que j'ai changé | Les déplacements du coach, avec « Non, remets comme avant » | `POST /api/planning/changes/{key}` |
| Demain | Lignes rédigées par le serveur | — |

Sorties : **C'est noté** (`POST /api/evening/done`), **Rappelle-moi dans N min** (`POST /api/evening/snooze`).

## 4. Actions

| Action | Geste | Écrit | Garde |
|---|---|---|---|
| Demander la lecture | bouton | `POST /api/brief` (appel modèle) | addition |
| Répondre à la lecture | appui sur le corps du bloc | ouvre un fil d'assistant semé (`POST /api/brief/thread`) | addition |
| Choisir métrique / plage | puces, segments | rien (lecture) | — |
| Ouvrir une ligne du jour | ligne entière | rien — navigue vers `/routine`, `/nutrition`, `/planning` | — |
| Toutes les saisies des parcours | voir §2 et §3 | — | additions, sans confirmation |

## 5. Liens sortants

`/routine` (eau, suppléments), `/nutrition` (protéines), `/planning` (séance), `/charge`,
`/objectif`, `/corps` et `/routine` (état vide), `/assistant` ×3, un lien par alerte.

## 6. Constats

- **La courbe « Tendance » redouble trois écrans.** Six de ses treize métriques sont des
  mensurations (la courbe de `/corps` ne les a pas, elle) ; poids et hydratation ont déjà
  leur courbe sur `/corps` et `/routine` ; volume, séances et distance hebdomadaires
  redisent `Entraînement` juste dessous et `/charge`.
- **« Entraînement » redit `/charge`.** Huit semaines en barres et la répartition par
  sport : `/charge` a « Huit semaines, par sport » avec la même découpe, et la page
  Courses un « Volume par semaine ». Cinq lectures du volume hebdomadaire dans
  l'application (voir [`modifications.md`](modifications.md), M-06).
- **Deux poids, deux variations sur le même écran.** La bande dit « +0,4 kg sur 8 pesées »,
  la courbe juste dessous « variation +1,9 kg » (fenêtre de la plage). Les deux sont
  justes, rien ne dit qu'ils ne mesurent pas la même chose.
- **La Forme peut contredire la page Courses.** Sur le banc rempli, dix courses `.fit` sans
  effort perçu : l'accueil dit « Pas encore de charge globale », la page Courses affiche
  une charge 7 jours de 297 et conseille « la prochaine sortie est facile ». Deux systèmes
  de charge (M-02).
- **L'état vide envoie ailleurs ce que « Noter » fait sur place.** « Noter une pesée » et
  « Boire un verre » mènent à `/corps` et `/routine`, alors que la feuille « Noter »
  enregistre les deux sans changer d'écran.
- **La rangée « Assistant » en pied d'écran a perdu sa raison d'être.** La barre du haut a
  une entrée Assistant sur ordinateur depuis `320bcfc`, et la barre basse aussi. Le
  commentaire de [`Dashboard.tsx`](../../frontend/src/routes/Dashboard.tsx) qui affirmait
  le contraire est corrigé (M-21, `3bcde3f`) ; la rangée elle-même attend M-22.
- **Le matin promet un rattrapage qui n'existe pas.** « Aucun repas noté hier — ils se
  rattrapent depuis Nutrition » : `/nutrition` n'ajoute qu'au jour même (M-01).
- **FC de repos et VFC s'écrivent chaque matin et ne se relisent nulle part** en série :
  ni courbe, ni liste. Elles ne reparaissent qu'en une ligne sur la page d'une course
  (« Le matin ») et dans la phrase de disponibilité (M-09).

## 7. Non vu

La lecture réellement écrite par un modèle (banc sans réponse de modèle) ; une alerte
ouverte ; une nuit Garmin ; les deux parcours en situation (le banc tournait à 13 h, hors
des deux fenêtres) — ils sont décrits depuis le code.
