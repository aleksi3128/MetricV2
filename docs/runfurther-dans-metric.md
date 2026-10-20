# Le cahier des charges RunFurther, porté dans Metric — plan d'action

Plan du 19/10/2026, **en attente du feu vert**. Rien n'est codé.

Le cahier des charges RunFurther (11/10/2026) décrit une application neuve : un coach de
course proactif et vocal, attentif aux blessures, multisport. Metric en couvre déjà une bonne
part — l'import `.fit` lu en entier, le coach du matin, la charge, les corrélations, la
natation, le planning et son flux iCal, l'assistant qui agit, les rappels push. Ce plan dit
ce qui manque, dans quel ordre le construire, et quelles décisions doivent être prises avant.

Il ne reprend **que les exigences fonctionnelles** (§2), le socle scientifique (§4) et les
critères d'acceptation (§8). La pile technique du §5 a été écrite pour une application qui
n'existait pas ; Metric en a déjà une, éprouvée, et le §1 ci-dessous dit pourquoi on la garde.

---

## 1. Ce qu'on prend du cahier, et ce qu'on laisse

| Le cahier dit | Metric a | Proposé | Pourquoi |
|---|---|---|---|
| Next.js en PWA | React + Vite en PWA | **garder** | Même résultat, aucun gain à migrer 747 tests d'écran |
| Un JSON par objet + index SQLite | CSV sur Nextcloud + cache | **garder** | Lisible hors de l'app, déjà le cas ; l'index n'a pas de besoin mesuré |
| APScheduler | `notifications/scheduler.py`, `brief/scheduler.py` | **garder** | Déjà sans Redis, testables par `tick()` |
| API Claude directe | OpenRouter derrière `ai/client.py` | **à trancher** (D9) | La couche d'abstraction existe déjà |
| Function calling natif | Contrat JSON (`assistant-agent.md` §3) | **garder** | Le choix a été argumenté et tient |
| Passkey, pas de mot de passe | Mot de passe Argon2id + JWT | **à trancher** (D8) | Aucune annulation : se verrouiller dehors coûte cher |
| DA cyan + vert volt + orange (§2.8) | La charte RunFurther, un seul rouge (lot du 19/10) | **à trancher** (D10) | Le §2.8 est antérieur à la charte qui vient d'être adoptée |
| `make status`, `doctor`, `sync`, `backup`… | `make console`, `check-storage`, `update` | **compléter** | On ajoute ce qui manque, on ne renomme pas |
| Hors périmètre : nutrition | Nutrition complète | **garder** | Le hors-périmètre de RunFurther ne retire rien à Metric |

---

## 2. L'écart, exigence par exigence

✅ couvert · ◐ partiel · ✗ absent. Seules les exigences **M** (MVP) sont détaillées ; les
**S** et **C** sont regroupées en fin de tableau.

| ID | Ce que Metric a | État | Ce qui manque |
|---|---|---|---|
| PLN-01 | `planning/plan.csv`, côte à côte prévu/réalisé pour la nage | ◐ | Vue mois, nature `vélo`, côte à côte pour course et renfo |
| PLN-02 | Génération d'une fenêtre par le modèle (`planning/generation.py`) | ✗ | Plan **périodisé** vers une course : phases, semaines de récup, plafonds |
| PLN-03 | Flux iCal **sortant** (`planning/ical.py`) | ✗ | Lire l'agenda iCloud, placer dans les créneaux libres |
| PLN-04 | `plan.propose` dans le fil Planning, réévaluation du matin | ◐ | Déclencheurs automatiques, notification oui/non, relance |
| PLN-05 | Notation nage `CR EF R15`, étapes du coach | ◐ | Notation **course** (`30' EF + 4 × 80 m LD`) |
| PLN-08 | — (`goals/` vise des métriques, pas des courses) | ✗ | Objectifs de course A/B/C, arbitrage des conflits |
| COA-01/02 | Assistant texte | ◐ | Voix : dictée, réponse parlée |
| COA-03 | Mémoire de l'assistant (L14b) | ◐ | Dossier médical, douleurs, décisions passées du coach |
| COA-04 | Consigne de l'assistant | ◐ | Ton « cash », principe nommé à chaque recommandation |
| COA-05 | Catalogue d'actions (`assistant/actions.py`) | ◐ | « On décale ? » — déplacer une séance, alléger une semaine |
| NOT-01 | Web Push VAPID, vérifié sur iPhone | ✅ | — |
| NOT-02 | Trois lectures du jour, parcours du matin | ◐ | Point du **soir** qui ouvre une conversation |
| NOT-03 | Garde-fous : 15 min d'écart, 10 par jour | ✗ | Relances toutes les 3 min, 19 h → minuit, « rappelle-moi dans 30 min » — **contredit** les garde-fous (D3) |
| NOT-04 | — | ✗ | Débrief déclenché par l'arrivée d'une activité |
| NOT-05 | — | ✗ | Alertes critiques : saut de charge, douleur qui revient, pattern |
| NOT-06 | Un seul niveau | ✗ | Trois priorités, heures calmes, le critique qui les traverse |
| ANA-01 | Import manuel `.fit`/`.zip`, import Apple, matin saisi à la main | ◐ | Synchro Garmin automatique, santé quotidienne (sommeil, VFC, stress, Body Battery) |
| ANA-02 | Doublon à la minute à l'import Apple (`IMP-04`) | ◐ | Dédoublonnage **entre sources**, la montre prioritaire (CA-03) |
| ANA-03 | Splits, FC, cadence, dynamique, dérive (`analysis.py`) | ◐ | Respect de la séance prévue, chiffré (CA-04) |
| ANA-04 | Charge = minutes × zone pondérée (`load.py`), rapport aigu/chronique | ◐ | sRPE multisport, CTL/ATL/TSB (D2) |
| ANA-05 | Corrélations par permutation (`correlations.py`) | ◐ | Douleurs, sommeil, chaussures, terrain parmi les facteurs |
| MED-01→06 | Rien — « douleur » n'apparaît que dans des consignes | ✗ | **Tout le module** |
| MSP-01/02 | Natation et renfo comptés à part ; `fit.py` **refuse** le vélo | ✗ | Vélo et marche importés, charge par sport et globale |
| DSH-01 | Charte RunFurther (lot en cours) | ✅ | — |
| DSH-02 | Tableau de bord | ◐ | Séance du jour + forme + alertes ouvertes en une vue |
| DSH-03 | Rapport aigu/chronique sur la page Course | ◐ | CTL/ATL/TSB, volume par sport |
| DSH-04 | Part du facile dans `load.py` | ◐ | 80/20 sur tous les sports, à l'écran |
| DSH-05 | — | ✗ | Frise des douleurs sur la courbe de charge |
| **S / C** | Riegel (`analysis.py`), `.fit` workout par câble (`workout_fit.py`), météo d'une sortie passée | ◐ | VDOT, chaussures, carte du corps, PDF praticien, météo prévue, envoi via Garmin Connect, appel vocal temps réel, brick |

**Lecture d'ensemble.** L'analyse d'une sortie est faite. Ce qui manque est ce qui fait de
RunFurther un *coach* plutôt qu'un *carnet* : les **douleurs**, la **charge multisport**
au sens de Banister, le **plan vers une course**, l'**insistance** des notifications, la
**voix**, et la **synchro automatique**.

---

## 3. Les décisions à prendre avant de coder

Chacune a une recommandation. Celles qui n'ont pas de défaut évident sont celles-ci.

| # | Question | Recommandé | Ce que ça coûte |
|---|---|---|---|
| D1 | La pile du §5 | **Garder celle de Metric** (§1) | On s'écarte du texte du cahier ; rien à migrer |
| D2 | Une seule échelle de charge | **sRPE (RPE × min) pour tous les sports**, zones gardées comme indicateur d'intensité | Une séance sans RPE n'a **pas** de charge — et le coach le demande ; deux échelles ne s'additionnent pas |
| D3 | Relances toutes les 3 min contre les garde-fous de 15 min / 10 par jour | **Un type « conversation due »** exempté de l'écart, avec un plafond de nuit réglable ; les autres rappels gardent leurs garde-fous | Une règle de plus dans `reminders.py` ; les garde-fous ne protègent plus ce type-là |
| D4 | La voix | **Prototype d'abord** : transcription cloud en français (service payant, annoncé avant le premier appel) et synthèse cloud ; repli sur la voix du navigateur | Un service tiers qui reçoit l'audio ; la Web Speech API est peu fiable dans une PWA iOS |
| D5 | Garmin non officiel (`garminconnect`/`garth`) | **Prototype d'abord**, identifiants chiffrés sur le serveur ; `.fit` reste la voie garantie (CA-08) | Risque de blocage du compte ; vos identifiants Garmin sur le serveur |
| D6 | L'agenda iCloud | **Lien ICS public en lecture** ; l'écriture reste le flux iCal que Metric publie déjà | Pas d'écriture directe dans iCloud (PLN-07 est déjà couvert par l'abonnement) |
| D7 | Le dossier médical chiffré | **AES-GCM, clé dans l'`.env` du serveur**, copie papier de la clé | Clé perdue = dossier illisible, sans annulation |
| D8 | Passkey | **Ajoutée, le mot de passe gardé en secours** | S'écarte du « pas de mot de passe » ; évite de s'enfermer dehors |
| D9 | Le modèle | **Rester sur OpenRouter**, un modèle Claude pour le coach | Un intermédiaire de plus que l'API directe |
| D10 | DA et nom | **Garder la charte rouge et le nom Metric** — le §2.8 est antérieur à la charte | Le cyan/volt du cahier n'est pas repris |
| D11 | Les douleurs passées (CA-01) | **Vous les saisissez** (dates, zone, intensité) avant le lot R1 | Sans elles, CA-01 ne se vérifie pas |

---

## 4. L'ordre — onze lots

Chaque lot aura **son propre plan** dans `docs/`, comme `coach-course.md` ou
`planning-natation.md`, écrit après décodage de la vraie donnée et une série de questions.
Ce document fixe l'ordre et le contour, pas le détail.

L'ordre suit le principe 5 du cahier — **la sécurité avant la performance** : les douleurs
et la charge passent avant le plan, parce qu'un plan généré sans elles serait aveugle à ce
qu'il doit d'abord protéger.

| Lot | Contenu | Exigences | Critère | Taille |
|---|---|---|---|---|
| **R0** | Prototypes des deux paris restants : Garmin non officiel (lire une activité, créer un entraînement), transcription vocale française. Push et WebDAV sont **déjà prouvés** dans Metric | P0 | Les deux marchent, ou le plan B est écrit | S |
| **R1** ✅ | Domaine `pain` : relevé de douleur après séance (texte d'abord), relance à J+1, réponse **graduée** par règles pures et non forçables (Silbernagel), aucun diagnostic — [`douleurs.md`](douleurs.md) | MED-01, 02, 05, 06 | CA-09 | M |
| **R2** ✅ | Charge multisport : RPE sur toute séance, sRPE, CTL/ATL/TSB (Banister), rapport aigu/chronique en moyennes exponentielles, monotonie et contrainte (Foster), progression sur 1 et 2 semaines (Nielsen). Import vélo et marche — [`charge-multisport.md`](charge-multisport.md) | ANA-04, MSP-01, 02 | CA-02 | L |
| **R3** ✅ | Notifications v3 : trois priorités, heures calmes, critique qui traverse, relances du soir et report, alertes de charge et de douleur — [`notifications-v3.md`](notifications-v3.md) | NOT-02→06 | CA-06 | M |
| **R4** ✅ | Patterns de douleur : douleur × allure, volume, chaussure, terrain, côté — sur le moteur de `correlations.py` ; alerte quand un pattern apparaît — [`patterns-douleur.md`](patterns-douleur.md) | MED-04, ANA-05 | CA-01 | M |
| **R5** ✅ | Objectifs de course A/B/C, plan **périodisé** calculé par règles (phases, plafonds Nielsen, 80/20 Seiler, affûtage Bosquet) ; le modèle choisit **dans** le cadre, comme le coach du matin. Notation course — [`plan-course.md`](plan-course.md) | PLN-02, 05, 08 | CA-05, CA-07 | L |
| **R6** ✅ | Agenda iCloud en lecture, placement dans les créneaux libres ; replanification automatique, notifiée avec sa justification et son principe, oui/non — [`agenda-replanification.md`](agenda-replanification.md) | PLN-03, 04, COA-05 | — | L |
| **R7** | Synchro Garmin automatique et santé quotidienne ; dédoublonnage entre sources ; débrief lancé à l'arrivée | ANA-01, 02, NOT-04 | CA-03, CA-08 | L — **dépend de R0** |
| **R8** | Voix : dictée dans l'assistant et le relevé de douleur, réponse parlée, ton du coach | COA-01→04 | — | M — **dépend de R0** |
| **R9** | Dossier médical chiffré, dicté et structuré, validé avant écriture ; mémoire du coach étendue | MED-03, COA-03 | — | M |
| **R10** | Tableau de bord : vue « aujourd'hui », CTL/ATL/TSB, 80/20 tous sports, frise des douleurs sur la charge ; respect de la séance prévue | DSH-02→05, ANA-03 | CA-04 | M |
| **R11** | Exploitation et sécurité : passkey, `make status`/`doctor`/`sync`/`backup`, export complet, plafond de dépense IA et voix | §5, §6 | — | M |

Le **MVP du cahier** est atteint à la fin de R11. Les exigences **S** et **C** (§2 tableau,
dernière ligne) viennent ensuite, dans l'ordre du cahier.

---

## 5. Ce que ce plan ne promet pas

- **Les seuils scientifiques ne sont pas vérifiés.** Le cahier le dit : ils sont cités de
  mémoire. Chaque lot vérifie ses sources avant d'écrire un seuil, et chaque seuil est un
  paramètre réglable, jamais une constante enfouie.
- **La liste des signaux d'urgence** (MED-05) doit être validée par un professionnel. Tant
  qu'elle ne l'est pas, R1 n'évoque **jamais** les urgences — il oriente vers le praticien.
- **La voie Garmin non officielle peut casser** à tout moment. Rien ne doit en dépendre
  seul : chaque écran reste alimentable par `.fit`.
- **Strava** n'est pas planifié : l'accord d'API rend l'analyse IA douteuse et Garmin couvre
  le besoin. À rouvrir si R0 échoue côté Garmin.
- **Aucun écran n'a été touché sur un vrai téléphone** (`CLAUDE.md` §7) — la voix et les
  relances rendent ce manque plus coûteux qu'avant. R3 et R8 se vérifient sur l'iPhone.

---

## 6. Avant de commencer

L'arbre de travail porte le lot DA RunFurther, **non commité** (22 fichiers modifiés, la
charte et les polices). Il faut le commiter, ou le mettre de côté, avant R0 — sans quoi le
premier commit de ce chantier l'emporterait avec lui.
