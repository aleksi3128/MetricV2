# L'agenda et la replanification

Lot **R6** de [`runfurther-dans-metric.md`](runfurther-dans-metric.md), plan du 20/10/2026.
Exigences PLN-03, PLN-04, COA-05.

Le plan de R5 pose ses séances le mardi, le jeudi et le dimanche, sans savoir qu'il y a cours
le mardi soir. Et une fois posé, il ne bouge plus : une séance ratée reste ratée, une douleur
laisse le fractionné de jeudi au planning. Ce lot lit l'agenda pour **placer**, et laisse le
coach **déplacer** — en le disant, avec sa raison, et en défaisant ce qu'on refuse.

Décisions prises seul (délégation du 19/10).

---

## 1. Les décisions

| # | Question | Décision | Ce que ça coûte |
|---|---|---|---|
| D1 | Lire l'agenda | **Le lien ICS** d'iCloud (« calendrier public »), lu toutes les 15 minutes au plus | Lecture seule ; un lien public se lit par qui le détient — il est rangé côté serveur, jamais renvoyé à l'écran en entier |
| D2 | Le format | **Un lecteur ICS écrit ici**, pur : événements, fuseaux, journées entières, répétitions hebdomadaires et quotidiennes, exceptions | Une règle de répétition exotique (mensuelle, « le 2ᵉ mardi ») n'est pas dépliée : l'événement compte à sa première date seulement — dit à l'écran |
| D3 | Ce qu'on garde d'un événement | **Son créneau occupé, rien d'autre** : ni titre, ni lieu, ni participants | — |
| D4 | La journée disponible | **7 h → 21 h 30**, une marge de 30 min autour de chaque événement ; le soir d'abord (après 17 h), sinon le premier créneau libre | Réglable plus tard ; un étudiant en stage court plutôt le soir |
| D5 | Pas de créneau ce jour-là | **Le jour d'à côté**, sans jamais deux jours de course d'affilée ni rien la veille d'une course | Une séance peut ne trouver aucune place : elle reste à son jour, sans heure, et c'est dit |
| D6 | Replanifier (PLN-04) | **Le coach modifie seul, notifie, et un « non » défait** — le cahier l'a tranché | La seule « annulation » du projet : elle restaure l'état d'avant, et refuse si la séance a changé depuis |
| D7 | Les déclencheurs | **Séance ratée** (hier, rien de couru) ; **douleur** (adaptée : le dur devient facile ; arrêt : la course devient repos) ; **forme du matin** (repos ou allègement aujourd'hui) ; **agenda** (une séance tombe sur un événement) | — |
| D8 | Une séance ratée | **Une facile ne se rattrape pas** ; une longue ou une dure se déplace au prochain jour libre de la semaine, sinon elle tombe | « On ne court pas après une séance » : le volume perdu ne se rattrape pas en entassant |
| D9 | Où on répond | **Au point du soir**, et sur `/plan` ; une modification de **demain** est une alerte critique (NOT-05) | Sans réponse, la modification tient — les relances du soir la redemandent |
| D10 | « On décale ? » (COA-05) | **Une action `plan.move`** pour l'assistant, qui demande un appui | — |

### Pourquoi le coach modifie seul

Le cahier l'a décidé (question ouverte n° 1, tranchée) : une replanification proposée qui
attend une réponse n'a pas eu lieu, et la séance de demain matin reste dure pendant qu'on
dort. Le coût est la seule annulation du projet, bornée : chaque modification garde l'état
d'avant, et « non » le remet — sauf si la séance a été retouchée entre-temps, auquel cas on
le dit plutôt que d'écraser.

---

## 2. Les données

| Fichier | Contenu |
|---|---|
| `settings.csv` | `agenda_ics_url` |
| `planning/changes.csv` | `key`, `session_id`, `action` (`move` · `lighten` · `rest` · `drop`), `before`, `after` (JSON), `reason`, `created`, `status` (`pending` · `accepted` · `refused`) |

---

## 3. Les calculs — purs

- `planning/ics.py` — un texte ICS, une fenêtre ; des intervalles occupés.
- `planning/placement.py` — une séance, des intervalles occupés ; un créneau, ou le jour
  d'à côté, ou rien.
- `planning/replan.py` — le planning, le réalisé, la douleur, la forme, l'agenda ; des
  modifications clées, chacune avec sa raison et son principe.

---

## 4. Les surfaces

- `GET/PATCH /api/planning/agenda` — l'état du lien (jamais le lien entier), son réglage.
- `GET /api/planning/changes`, `POST /api/planning/changes/{key}` `{accept}`.
- L'ordonnanceur : une passe de replanification toutes les 15 minutes ; une notification par
  modification.
- Le poser du plan (R5) passe par le placement quand l'agenda est réglé.
- `/plan` : la carte « Agenda », et « Ce que le coach a changé ».
- Le point du soir : les modifications en attente de réponse.

---

## 5. Ce que ce lot ne fait pas

- **Écrire dans l'agenda** (PLN-07) : Metric publie déjà son flux iCal, auquel l'agenda
  s'abonne.
- **CalDAV**, et donc les agendas privés sans lien public.
- **Les règles de répétition mensuelles et annuelles.**

---

## 6. Journal

### R6 livré (20 octobre 2026)

Livré tel que planifié. Le lecteur ICS est éprouvé sur un agenda iCloud typique — fuseau
`TZID`, cours hebdomadaires du mardi et du jeudi avec une exception, stage en UTC, journée
entière, ligne pliée, `VALARM` imbriqué, événements annulés et transparents, règle mensuelle
comptée une fois. Le titre d'un événement n'existe nulle part après lecture.

La replanification a été rejouée de bout en bout : douleur à l'arrêt → la séance de demain
devient repos → « non » la remet ; sortie facile ratée → retirée → « non » la remet ;
séance retouchée entre-temps → le « non » est refusé, en toutes lettres.

#### Ce que le passage à l'écran a trouvé

- **Une séance ratée était replacée à 7 h aujourd'hui… à 7 h 51.** Le placement ne
  connaissait pas l'heure : un créneau déjà passé lui semblait libre. Il reçoit désormais
  l'instant présent quand il vise aujourd'hui.
- **Le lien d'une relance de la veille, ouvert au réveil, superposait le point du soir au
  parcours du matin** — le cas noté en R3, vu pour de vrai. Réglé.
- Un « : » en début de ligne dans le résumé du plan : espace insécable avant.

#### Laissé, et pourquoi

- **Le vrai lien iCloud n'a jamais été lu** : tout passe par un agenda d'essai, comme
  Open-Meteo et OpenRouter. Le premier lien réglé en production sera la première lecture.
- **La journée disponible (7 h → 21 h 30) et la préférence du soir** sont des constantes ;
  un réglage viendra si l'usage le demande.
- **Les autres phrases du serveur** peuvent, elles aussi, couper avant un « : » ; seule
  celle qui s'est vue est corrigée.

