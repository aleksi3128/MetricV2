# La synchro Garmin, la santé de la nuit, et les doublons

Lot **R7** de [`runfurther-dans-metric.md`](runfurther-dans-metric.md), plan du 20/10/2026.
Exigences ANA-01, ANA-02, NOT-04 ; critères d'acceptation CA-03 et CA-08.

Aujourd'hui, une sortie entre dans Metric parce qu'on dépose son `.fit`. Le cahier veut
qu'elle arrive seule, avec la nuit — sommeil, VFC, FC de repos, stress, Body Battery — et
qu'une même sortie reçue deux fois ne compte qu'une fois.

Garmin n'ouvre plus son API officielle. La voie est la bibliothèque non officielle
`garminconnect`, avec les identifiants de l'utilisateur : elle peut casser du jour au
lendemain. **Le lot R0 — prouver qu'elle marche — attend ces identifiants** ; ce lot pose
tout le reste, éprouvé contre une doublure, et laisse l'import `.fit` intact (CA-08).

Décisions prises seul (délégation du 19/10).

---

## 1. Les décisions

| # | Question | Décision | Ce que ça coûte |
|---|---|---|---|
| D1 | Le connecteur | **`garminconnect`**, importé seulement s'il est installé, derrière une interface à trois méthodes : les activités depuis une date, le `.fit` d'origine d'une activité, la santé d'un jour | Rien n'a été appelé pour de vrai : R0 |
| D2 | Les identifiants | **Dans l'`.env` du serveur**, comme les autres secrets (`GARMIN_EMAIL`, `GARMIN_PASSWORD`) ; les jetons de session dans un dossier du serveur | Le chiffrement applicatif des identifiants vient avec le dossier médical (R9) |
| D3 | Le rythme | **Toutes les 30 minutes**, et à la demande | Une sortie apparaît au plus une demi-heure après la synchro de la montre |
| D4 | Ce qui est importé | **Le `.fit` d'origine**, rangé comme un dépôt à la main, aiguillé par sport : course, natation, vélo/marche/randonnée ; le reste est ignoré | Une activité déjà importée à la main n'est pas doublée : le refus du « même fichier » s'applique |
| D5 | La santé de la nuit | **FC de repos et VFC** dans `body/morning.csv` (s'il n'y a rien ce jour-là — une saisie l'emporte) ; **sommeil, stress, Body Battery** dans `body/health.csv` | — |
| D6 | Les doublons (CA-03) | **Deux courses du même jour dont les heures se chevauchent sont la même sortie.** On garde la meilleure source : montre (`fit`, `garmin`) > Apple > saisie ; les autres sont marquées `duplicate_of` et sortent de tous les comptes | Une course sans heure ne se compare à rien : deux saisies du même jour restent deux sorties |
| D7 | Le débrief à l'arrivée (NOT-04) | **Une notification par sortie synchronisée**, qui ouvre sa page — l'effort perçu et la douleur s'y demandent | — |
| D8 | La panne (CA-08) | **Le connecteur en panne ne bloque rien** : l'état le dit, l'import `.fit` reste la voie garantie | — |

### Pourquoi un doublon se marque au lieu de se supprimer

Le projet n'a aucune annulation, et la sortie écartée peut porter ce que l'autre n'a pas — la
note tapée à la main, l'effort perçu. Elle reste dans le fichier, marquée, et revient d'elle-
même si la sortie gardée est supprimée.

---

## 2. Les données

| Fichier | Contenu |
|---|---|
| `activity/runs.csv` | colonne `duplicate_of` : le `run_id` de la sortie gardée |
| `body/health.csv` | **nouveau**, famille *mesure* : `date`, `sleep_min`, `sleep_score`, `stress_avg`, `body_battery_high`, `body_battery_low`, `source` |
| `sync/imported.csv` | **nouveau** : `garmin_id`, `kind`, `local_id`, `date` — ce qui a déjà été importé |
| `sync/state.csv` | **nouveau** : la dernière synchro réussie, la dernière erreur |

---

## 3. Les surfaces

- `activity/dedup.py`, pur : des courses d'un jour, la gardée et les écartées.
- `sync/connector.py` : l'interface, l'implémentation `garminconnect`, et l'erreur qui dit
  ce qui manque (bibliothèque, identifiants, refus de Garmin).
- `sync/service.py` : la passe — activités, puis santé — et son état.
- `GET /api/sync`, `POST /api/sync` ; `GET /api/body/health`.
- L'ordonnanceur : une passe toutes les 30 minutes, une notification par sortie reçue.
- Réglages : une carte « Garmin » — l'état, la dernière synchro, « Synchroniser ».

---

## 4. Ce que ce lot ne fait pas

- **Appeler Garmin pour de vrai** : R0, sur accord et avec les identifiants.
- **Strava** : écarté par le cahier lui-même.
- **Envoyer les séances sur la montre par Garmin Connect** (PLN-06, V2) : le `.fit`
  d'entraînement existe déjà, à copier par câble.

---

## 5. Journal

### R7 livré (20 octobre 2026)

Livré tel que planifié, **contre une doublure** : aucun appel à Garmin n'a eu lieu. CA-03
rejoué de bout en bout — deux morceaux Apple puis la sortie de la montre sur les mêmes
heures : la montre reste seule dans l'historique, la semaine et la charge ; supprimée, les
deux morceaux reviennent. CA-08 rejoué : un connecteur qui refuse la connexion laisse son
erreur dans l'état, l'écran la dit, et l'import d'un `.fit` passe.

Deux conséquences du dédoublonnage, à connaître :

- **Une sortie marquée en double disparaît de l'historique** : elle n'est plus comptée, et
  elle ne se voit plus. Elle reste au fichier et revient si la gardée est supprimée.
- **La sortie gardée change de jeton** quand elle écarte une autre : `create` la relit
  avant de la rendre, sans quoi l'effort perçu demandé juste après l'import partait en
  conflit. Un test le tient.

#### Ce que le passage à l'écran — et les tests — ont trouvé

- **« Body Battery » s'écrivait « body battery »** : `capitalize()` met en minuscules tout
  ce qui suit la première lettre. Corrigé.
- La date de dernière synchro était mise en forme par l'écran avec `new Date()` — ce que
  l'invariant du dépôt interdit. Le serveur la rédige.
- La carte redisait sous le message du serveur que l'import `.fit` reste possible : le
  rappel ne s'affiche plus qu'en cas de panne.

#### Laissé, et pourquoi

- **R0 n'a pas eu lieu** : sans identifiants ni accord, `garminconnect` n'est pas installé
  et n'a jamais été appelé. Les noms de ses méthodes et de ses champs viennent de sa
  documentation ; le premier appel réel les éprouvera.
- **Les identifiants sont en clair dans l'`.env`**, comme les autres secrets du serveur ;
  le chiffrement applicatif vient avec R9.
- **Aucun écran ne montre encore la nuit** (sommeil, stress, Body Battery) : l'API la sert,
  l'accueil de R10 l'affichera.


### Pas d'accès au compte (20 octobre 2026)

**R0 est tranché : l'utilisateur ne donne pas accès à son compte Garmin.** L'import du
`.fit` reste la seule voie, comme CA-08 le garantissait. La carte « Garmin » quitte les
réglages, et l'accueil ne promet plus une nuit « qui arrive avec la synchro » : elle ne
s'affiche que si elle existe. Le connecteur, la passe de l'ordonnanceur et `make sync`
restent dans le dépôt, **inertes** sans identifiants — l'ordonnanceur se tait déjà quand ils
manquent. Le dédoublonnage (D6) sert toujours : deux `.fit` de la même sortie, ou un `.fit`
et une capture Apple.
