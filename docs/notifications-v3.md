# Notifications v3 — trois priorités, le point du soir, et ce qui insiste

Lot **R3** de [`runfurther-dans-metric.md`](runfurther-dans-metric.md), plan du 19/10/2026.
Exigences NOT-02 à NOT-06 ; critère d'acceptation CA-06.

Les rappels de Metric sont polis par construction ([`notifications-v2.md`](notifications-v2.md)) :
quinze minutes entre deux, dix par jour, chacun éteint par défaut. Le cahier RunFurther
veut l'inverse sur un point précis — **un coach qui vient chercher** : un point du soir qui
relance toutes les 3 minutes de 19 h à minuit tant qu'on n'y a pas répondu, avec un
« rappelle-moi dans 30 min » ; des alertes critiques qui traversent les heures calmes.

Ce lot ajoute cette insistance **à côté** des rappels existants, sans affaiblir leurs
garde-fous. Décisions prises seul (délégation du 19/10), chacune avec son coût.

---

## 1. Les décisions

| # | Question | Décision | Ce que ça coûte |
|---|---|---|---|
| D1 | Les garde-fous de v2 (15 min, 10 par jour) | **Intacts pour les rappels.** Les relances du soir et les alertes ont leur propre budget, et ne consomment pas celui des rappels | Deux budgets à lire ; un rappel de 21 h peut tomber entre deux relances |
| D2 | Les priorités | **Critique** : alertes (saut de volume, douleur à l'arrêt, douleur qui revient). **Normale** : point du soir, suivi de douleur, séances. **Info** : le reste | — |
| D3 | Les heures calmes | **00 h → 7 h** par défaut, réglables ; tout se tait sauf le critique | Une alerte critique peut réveiller : c'est ce que le cahier demande |
| D4 | Le point du soir | **Une feuille, comme le parcours du matin** : l'effort des séances du jour, la douleur, la séance de demain, puis « C'est noté » | La voix (« viens me parler ») attend R8 : ce lot pose ce qu'elle dira |
| D5 | Les relances | **Toutes les 3 min de 19 h à minuit**, plafond de 100 par soir, **une seule notification** à l'écran (même `tag`, `renotify`) — elles se remplacent, elles ne s'empilent pas | Un téléphone qui vibre toutes les 3 minutes : c'est le choix du cahier, réglable et désactivable |
| D6 | « Rappelle-moi dans 30 min » | **Dans la feuille du soir**, partout ; **dans la notification** sur ordinateur, par une action et un lien signé | iOS n'affiche pas les actions d'une notification web : sur iPhone, le report se fait dans l'application |
| D7 | Le défaut à l'installation | **Activé**, contrairement aux rappels de v2 | Le cahier en a fait une décision ; elle se coupe en Réglages |
| D8 | Le débrief à l'arrivée d'une activité (NOT-04) | **Le mécanisme, branché sur les activités synchronisées** — il n'y en a pas avant R7 | Une sortie importée à la main a déjà son débrief dans la feuille d'import |
| D9 | Ce que « répondu » veut dire | **« C'est noté » dans la feuille du soir.** Ouvrir l'application ne suffit pas | Un appui de plus, mais c'est lui qui dit que le point a eu lieu |

### Pourquoi les relances ne s'empilent pas

Cent notifications distinctes laisseraient cent lignes dans le centre de notifications, et
la seule chose qu'on y apprendrait serait de toutes les balayer — y compris l'alerte
critique du lendemain. Même `tag` : chaque relance **remplace** la précédente et la fait
vibrer à nouveau (`renotify`). L'insistance est dans le temps, pas dans la pile.

### Pourquoi un lien signé pour le report

Le service worker n'a pas le jeton de session — il vit hors de la page, sans accès au
stockage local. Pour reporter depuis la notification sans ouvrir l'application, il appelle
une route **publique** qui n'accepte qu'un lien signé (HMAC sur le jour), et qui ne sait
faire qu'une chose : reporter le point du soir de ce jour-là. Un lien volé permet, au pire,
de faire taire une relance trente minutes.

---

## 2. Les données

| Fichier | Changement |
|---|---|
| `routine/evening.csv` | **nouveau**, famille *planning* : `date`, `done`, `snoozed_until` |
| `notifications/sent.csv` | colonne `key` : l'identité d'une alerte (`longest:2026-10-08`), pour ne la dire qu'une fois |
| `settings.csv` | `evening_enabled`, `evening_start`, `evening_end`, `evening_interval_min`, `evening_snooze_min`, `evening_cap`, `quiet_start`, `quiet_end` |

---

## 3. Les règles — `notifications/escalation.py`, pur

- `quiet(now, start, end)` — la fenêtre peut passer minuit.
- `evening_due(now, settings, state)` — dans la fenêtre, pas fait, pas reporté, l'intervalle
  écoulé depuis la dernière relance, sous le plafond.
- `compose_evening(count)` — la première dit ce qu'est le point ; les suivantes, qu'il
  attend. **Jamais** « tu n'as pas répondu » au-delà de ce que l'application sait.
- Les alertes : une liste de constats clés, déjà rédigés par leur domaine — `training` pour
  les sauts de volume, `pain` pour l'arrêt et le retour d'une douleur.

---

## 4. Les surfaces

### Backend

- `domains/evening/` : `GET /api/evening`, `POST /api/evening/done`,
  `POST /api/evening/snooze` ; et, hors du groupe protégé, `POST /api/public/evening/snooze`
  sous signature.
- `GET /api/notifications/alerts` — les alertes ouvertes, que l'accueil affichera (R10).
- `PATCH /api/notifications/escalation` — les réglages du soir et des heures calmes.
- `scheduler.tick` : trois passes — alertes, point du soir, rappels — dans cet ordre.

### Frontend

- La feuille du soir : s'ouvre seule quand le point est dû, et depuis la notification.
- Réglages : une carte « Point du soir et heures calmes ».
- Le service worker : `renotify`, et l'action de report quand la charge utile la porte.

---

## 5. Ce que ce lot ne fait pas

- **La voix** du point du soir (R8).
- **Les alertes de pattern** (R4) et de **séance modifiée** (R6) : la liste les accueille.
- **Le rappel avant séance avec la météo** (NOT-07, V2).

---

## 6. Journal

### R3 livré (19–20 octobre 2026)

Livré tel que planifié, CA-06 rejoué sur l'ordonnanceur : relances à 19 h 00, 03, 06,
09 ; silence trente minutes après un report, puis reprise ; une alerte critique qui passe
les heures calmes, une seule fois.

#### Un défaut de fond, trouvé en lisant une réponse

**Une course saisie au clavier n'avait pas d'identifiant stable** : `run_id` n'était donné
qu'aux sorties importées, pour leurs paliers. Le point du soir rattachait donc sa question
de douleur à `ligne-0` — la position dans le fichier, qui se décale à la première
suppression : une douleur aurait glissé sur une autre séance. Toute course reçoit
désormais son identifiant à la création ; une correction le conserve, comme avant. Une
course d'avant ce lot, sans identifiant, se note mais ne reçoit pas la question.

Deux tests affirmaient l'ancien comportement (« une saisie ne porte pas d'identifiant ») ;
ils disent maintenant le nouveau.

#### Ce que le passage à l'écran a trouvé

- Le « Plus tard » de la question de douleur, **dans** la feuille du soir, ne menait nulle
  part : c'est le point du soir lui-même qui reprend ce qui a été remis. Retiré là.
- « Demain » en liste à puce pour une seule ligne. Passé en lignes simples.
- La carte de réglages collait ses champs au bouton, et ce bouton était une pastille
  **sélectionnée** quand le point est activé — à l'envers de son libellé, « Couper ».

#### Laissé, et pourquoi

- ~~Un lien de relance ouvert le matin superpose deux feuilles~~ — **réglé avec R6** : le
  cas s'est produit en regardant la page, et un lien de relance n'ouvre plus la feuille que
  dans la fenêtre du soir ; hors fenêtre, il s'efface sans rien ouvrir.
- **iOS n'affiche pas les actions** d'une notification web : le report y passe par la
  feuille. Rien n'a été essayé sur un vrai téléphone.
- **Le débrief à l'arrivée d'une activité** (D8) attendait la synchronisation de R7, **retirée
  le 28 octobre** ([`synchro-garmin.md`](synchro-garmin.md)) : il ne viendra pas par là.

