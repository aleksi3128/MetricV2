# Charge — `/charge`, « Charge & forme »

**Rôle.** La charge d'entraînement tous sports : forme, fatigue et fraîcheur (Banister),
la douleur en frise, l'intensité et le volume des huit dernières semaines.

**Comment on y arrive.** « Plus » → Regarder en arrière → Charge & forme ; « Voir la
charge » dans le bloc « Forme » de l'accueil ; entrée de la barre du haut sur ordinateur.

Fichier : [`Load.tsx`](../../frontend/src/routes/Load.tsx).

---

## 1. Ce que l'écran montre

Haut d'écran rempli : 1 810 px.

| Bloc | Ce qu'il montre | Source | Vide / erreur |
|---|---|---|---|
| **Forme et fatigue** | Forme (CTL), fatigue (ATL), fraîcheur (TSB) ; phrase de forme ; courbe de charge avec la douleur en frise (alerte au-dessus du seuil d'arrêt) | `GET /api/training` | « Pas encore de charge globale : aucune séance n'a d'effort perçu… » ; séances sans effort perçu comptées par sport |
| **Rapport et monotonie** | Rapport aigu / chronique, monotonie, séances non notées | même appel | « Pas de rapport de charge sans séance notée » |
| **Intensité** | Facile / modéré / dur sur 28 jours, tous sports, contre une cible de **80 %** de facile | même appel | « Pas de répartition » |
| **Volume** | Huit semaines : durée totale et détail par sport | même appel | « Rien » par semaine |

Écran en **lecture seule** : aucune action, aucun lien sortant.

## 2. Constats

- **Deux charges dans l'application, et elles ne disent pas la même chose.** Celle-ci compte
  l'effort perçu × les minutes, et ignore toute séance sans effort perçu ; celle de
  `/activite/courses` compte les minutes pondérées par zone de FC, et ne concerne que la
  course. Sur le banc, dix courses `.fit` sans effort perçu : ici, « aucune charge » ; là,
  une charge 7 jours de 297 et un conseil pour la sortie suivante (M-02).
- **Deux cibles de facile** : 80 % sur 28 jours ici
  ([`training/intensity.py:27`](../../backend/app/domains/training/intensity.py#L27)),
  70 % sur 14 jours sur la page Courses
  ([`activity/load.py:48`](../../backend/app/domains/activity/load.py#L48)) (M-02).
- **« Huit semaines, par sport » redit l'accueil.** La carte « Entraînement » du tableau de
  bord porte huit semaines en minutes et la répartition par sport ; `/activite/courses` a
  son « Volume par semaine » et sa « Charge par semaine » ; `/activite/natations` ses
  quatre semaines (M-06, M-07).
- **L'état vide affirme quelque chose de faux.** Sans aucune séance, l'écran écrit
  « Toutes les séances des 4 semaines ont un effort perçu » — vrai au sens logique, lu comme
  une mesure (M-21).
- **L'écran dépend d'un geste qu'aucun écran ne réclame clairement.** Toute la page se
  remplit par l'effort perçu ; « Je l'ai faite » sur une séance Cadence ne le demande pas,
  un import `.fit` le propose en fin de feuille avec « Plus tard ». Le point du soir est le
  seul endroit qui le demande pour toutes les séances du jour.

## 3. Non vu

La courbe et la frise de douleur remplies : le banc n'a semé aucun effort perçu.
