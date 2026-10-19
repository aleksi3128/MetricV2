# La natation, activité à part entière

[`planning-natation.md`](planning-natation.md) a fait entrer la natation au planning, et son
réalisé par le `.fit` de la montre. Elle n'existait pourtant qu'au planning : absente de
`/activite`, absente des minutes de la semaine, de l'assiduité et du tableau de bord — une
semaine de bassin y paraissait vide. Et sans montre, pas de natation du tout.

Ce lot en fait une activité comme la course. Décidé le 19 octobre 2026.

---

## 1. Les décisions

| # | Question | Décision | Ce qu'elle coûte |
|---|---|---|---|
| N1 | Comment s'ajoute une natation faite ? | **Le `.fit`, et une saisie à la main dans la notation** — `400 CR EF / 8×50 CR R30`, le serveur en tire la distance ; la durée se saisit | Une séance saisie n'a ni tours ni fréquence cardiaque |
| N2 | Où se montre-t-elle ? | **Dans l'historique fusionné, et sur une page `/activite/natations`** qui liste et détaille | Une page de plus |
| N3 | Le bouton d'ajout | **Deux boutons** : « Enregistrer une course », « Enregistrer une natation » | Un bouton de plus dans l'en-tête |
| N4 | Compte-t-elle partout ? | **Oui** : minutes et séances de la semaine, répartition du tableau de bord, assiduité, objectifs de régularité | Un fichier de plus lu par ces vues |

---

## 2. Les données

`activity/swims.csv` gagne trois colonnes, en dernier et avec un défaut : `program` (la
séance saisie, dans la notation), `note`, et `source` y était déjà (`fit` ou `manual`).

- **Une natation saisie** porte son programme ; sa distance est **le total lu par le
  serveur**, écrit dans `distance_m` au moment de l'enregistrement — comme l'allure d'une
  course est rangée avec elle, pour que le fichier se lise sans outil. Un programme fautif
  est refusé ligne par ligne (`swim_notation_invalid`), et un programme sans bloc aussi :
  une natation saisie sans distance n'aurait rien à compter.
- **Une natation importée** ne change pas : ses tours, réécrits dans la notation.
- La séance réécrite (`lines`) vient des tours pour une importée, du programme lu pour une
  saisie. L'écran ne distingue pas les deux, il affiche des lignes.
- Correction d'une natation saisie : `PATCH /activity/swims/{id}` sous `If-Match`. Une
  natation importée ne se corrige qu'au tour — sa distance est une mesure.

## 3. Où elle compte

| Vue | Avant | Après |
|---|---|---|
| Minutes, séances de la semaine, huit semaines (`ACT-10`, `ACT-12`) | courses + circuits | **+ natations** |
| Historique fusionné (`ACT-13`) | courses + circuits | **+ natations** (`kind: swim`, distance en mètres) |
| Répartition du tableau de bord (`AGG-02`) | Course · Tabata | **Course · Tabata · Natation** |
| Assiduité — « Minutes d'activité » | courses + circuits | **+ natations** |
| Assiduité — une source nouvelle | — | **« Distance nagée »**, en mètres |
| Séries hebdomadaires (`AGG-04`, objectifs de régularité) | courses + circuits | **+ natations** |

La distance de la semaine (`distance_km`) et l'allure moyenne restent **la course seule** :
additionner des mètres nagés à des kilomètres courus ne veut rien dire.

## 4. L'écran

- `/activite` : un second bouton, « Enregistrer une natation », qui ouvre une feuille à deux
  chemins — importer le `.fit`, ou saisir. La saisie réemploie le champ de programme du
  planning, son aperçu lu par le serveur et ses puces.
- `/activite/natations` : la semaine et les quatre dernières en mètres (calculés au
  serveur), puis la liste. Un appui ouvre la feuille de la séance — celle du planning, la
  seule implémentation.
- L'historique de `/activite` montre une natation avec ses mètres, et l'ouvre au même
  endroit.

## 5. Ordre, et vérification

1. Serveur : colonnes, saisie, correction, comptes, source d'assiduité — tests d'API.
2. Écran : bouton, feuille, page, historique — tests d'écran, puis **regarder** sur la
   vraie API en mémoire, deux thèmes, trois largeurs ; la feuille nouvelle entre dans
   `audit-surfaces.mjs`.
