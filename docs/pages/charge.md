# Charge — `/charge`, « Charge & forme »

**Rôle.** La charge d'entraînement tous sports : forme, fatigue et fraîcheur (Banister),
la douleur en frise, l'intensité et le volume des huit dernières semaines.

**Comment on y arrive.** « Plus » → Relire → Charge & forme ; « Voir la
charge » dans le bloc « Forme » de l'accueil ; entrée de la barre du haut sur ordinateur.
Depuis M-07, c'est la seule maison du volume hebdomadaire tous sports.

Fichier : [`Load.tsx`](../../frontend/src/routes/Load.tsx).

---

## 1. Ce que l'écran montre

Haut d'écran rempli : 1 810 px.

| Bloc | Ce qu'il montre | Source | Vide / erreur |
|---|---|---|---|
| **Forme et fatigue** | Forme (CTL), fatigue (ATL), fraîcheur (TSB) ; phrase de forme — qui dit « dont N courses des 4 semaines estimées depuis la FC » ; la phrase des courses estimées (`estimated_text` : le facteur et ses paires, ou ce qu'il manque pour estimer) ; courbe de charge avec la douleur en frise (alerte au-dessus du seuil d'arrêt) | `GET /api/training` | « Pas encore de charge globale : aucune séance n'a d'effort perçu… » ; séances sans effort perçu ni estimation comptées par sport |
| **Rapport et monotonie** | Rapport aigu / chronique, monotonie, séances non notées | même appel | « Pas de rapport de charge sans séance notée » |
| **Intensité** | Facile / modéré / dur sur 28 jours, tous sports, contre une cible de **80 %** de facile | même appel | « Pas de répartition » |
| **Volume** | Huit semaines : durée totale et détail par sport | même appel | « Rien » par semaine |

Écran en **lecture seule** : aucune action, aucun lien sortant.

## 2. Constats

- **Deux charges dans l'application, et elles ne disent pas la même chose.** Celle-ci compte
  l'effort perçu × les minutes, et ignore toute séance sans effort perçu ; celle de
  `/activite/courses` compte les minutes pondérées par zone de FC, et ne concerne que la
  course. ~~Un conseil pour la sortie suivante~~ : parti (M-02, `385871a`), et la page
  Courses nomme la sienne « Charge de course (FC) » avec un lien ici. ~~**Reste** l'écart
  (M-02, point 4)~~ : fermé le 29 octobre (session 10 c, `22a53dd`) — une course avec FC sans effort
  perçu entre ici par sa charge FC convertie, **dite estimée depuis la FC**, sur un facteur
  appris des courses qui ont les deux, et rien sous cinq paires
  ([`charge-multisport.md`](../charge-multisport.md) §7). Sous le seuil, l'écart demeure, et
  la page dit ce qu'il manque. Le vélo et la marche avec FC n'ont pas de zones : hors de
  l'estimation.
- ~~**Deux cibles de facile.**~~ Corrigé (M-02, `1fa151b`) : `EASY_TARGET`, 80 %, est la
  seule cible, et la phrase se rédige depuis elle. La page Courses ne juge plus ; le
  coach garde son plancher de 70 % (`coach/frame.py`), qui n'est pas une cible.
- ~~**« Huit semaines, par sport » redit l'accueil.**~~ Corrigé (M-06, M-07, `c67f06f`) :
  l'accueil a rendu ses huit semaines en barres et sa répartition ; `/charge` est la seule
  maison du volume tous sports. `/activite/courses` (« Volume par semaine », « Charge par
  semaine ») et `/activite/natations` (quatre semaines) gardent le volume de leur sport,
  qui est leur sujet. La répartition par sport sur la période n'a pas suivi :
  `/api/training` ne la sert pas.
- ~~**L'état vide affirme quelque chose de faux.**~~ Corrigé (M-21, `3bcde3f`) : sans
  aucune séance sur 4 semaines, le serveur tait « Toutes les séances des 4 semaines ont un
  effort perçu », et l'écran ne dessine rien à sa place. La phrase de forme suit
  (`3930cfb`) : sans aucune séance, « aucune séance enregistrée », et non plus « aucune
  séance n'a d'effort perçu ».
- ~~**Trois défauts vus à l'écran le 26 octobre, laissés**~~ — corrigés le 28 (`98b0ac8`) :
  forme, fatigue et fraîcheur s'arrondissent une fois au serveur (`form`, `fatigue`,
  `freshness`), que tuiles et phrase lisent ; les deux cartes sont en pile ; les bornes de la
  frise sont dans le cadre. Les parts facile / modéré / dur arrivent en entiers qui font 100
  (plus grand reste). Ce qu'on lisait : la tuile « Fatigue » dit 7 quand la phrase dessous dit
  « fatigue 6 » — le serveur sert `atl = 6.5`, que la phrase arrondit à l'entier pair
  (`round` de Python) et la tuile au-dessus (`num(…, 0)`) ; un chiffre servi déjà arrondi
  ôterait l'écart ; les cartes « Forme et fatigue » et « Rapport et monotonie » se touchent, sans
  espace entre elles ; l'étiquette « 10 » de la frise de douleur déborde à gauche du cadre.
- **L'écran dépend d'un geste qu'aucun écran ne réclame clairement.** Toute la page se
  remplit par l'effort perçu ; « Je l'ai faite » sur une séance Cadence ne le demande pas,
  un import `.fit` le propose en fin de feuille avec « Plus tard ». Le point du soir est le
  seul endroit qui le demande pour toutes les séances du jour.

## 3. Non vu

La courbe et la frise de douleur remplies : le banc n'a semé aucun effort perçu.
