# Les douleurs — relevé après séance, suivi du lendemain, réponse graduée

Lot **R1** de [`runfurther-dans-metric.md`](runfurther-dans-metric.md), plan du 19/10/2026.
Exigences MED-01, MED-02, MED-05, MED-06 du cahier RunFurther ; critère d'acceptation CA-09.

Metric ne sait rien des douleurs. Le mot n'apparaît que dans des consignes de modèle — « une
douleur mentionnée : repos et un professionnel » — et dans le carnet de l'assistant, en
texte libre. Le coach du matin peut donc proposer un fractionné à quelqu'un qui boite.
Ce lot donne aux douleurs un fichier, une règle de réponse, et une prise sur le coach.

Les patterns (douleur × allure, chaussure, terrain) sont **R4**. Ce lot écrit la donnée
qu'ils liront ; il ne la croise pas.

---

## 1. Les décisions

Prises avec l'utilisateur le 19/10, en quatre séries de questions.

| # | Question | Décision | Ce que ça coûte |
|---|---|---|---|
| D1 | Où le relevé est demandé | **Dans la feuille d'import**, après l'effort perçu : « une douleur ? » non/oui | La feuille s'allonge d'une étape ; « non » reste à deux appuis |
| D2 | La zone | **Texte libre** | R4 devra rapprocher « pied ext. D » et « extérieur du pied droit » |
| D3 | Le seuil d'arrêt | **7/10** | Une douleur à 6 sans autre signe reste en séance adaptée |
| D4 | Les signes qualifiants | **Vive, en hausse ou avec boiterie : arrêt à toute intensité** (MED-05) | Une douleur vive à 2/10 arrête la course |
| D5 | La hausse | **Arrêt dès la première hausse** sur le relevé précédent | Une raideur du lendemain, plus forte qu'à chaud, arrête aussi |
| D6 | « Séance adaptée » dans ce lot | **Le cadre du coach se resserre** : du facile seulement, sans hausse de volume ; l'arrêt ne laisse que le repos | La replanification avec oui/non reste à R6 |
| D7 | Le suivi à J+1 | **Une étape du parcours du matin, et un push à 12 h** si elle n'est pas faite | Un rappel de plus, avant que R3 n'apporte les priorités |
| D8 | La fermeture | **Revenue à son niveau de base** (Silbernagel) | Il faut une base : elle est demandée au relevé |
| D9 | La base | **Demandée au relevé** : « et avant la séance, combien ? » | Un curseur de plus |
| D10 | Où ça vit à l'écran | **Une section de `/corps`**, et rappelée sur la page de la course | — |
| D11 | Côté et type | **Deux listes fermées** : côté G/D/les deux/sans objet ; type sourde, vive, tiraillement, brûlure, raideur, autre | — |
| D12 | Les notes « douleur » du carnet | **Laissées** ; l'assistant lit les deux | — |

### Deux écarts aux réponses, et pourquoi

**La base n'est pas préremplie.** La question de D9 proposait de préremplir le curseur avec
la dernière base connue de la zone. Le dépôt a déjà tranché ce cas pour la pesée du matin :
une valeur passée est **rappelée en phrase**, jamais préremplie — un champ prérempli se
valide d'un appui sans être lu, et le fichier de mesures recevrait une valeur que personne
n'a donnée. Même règle ici : « dernière base notée pour cette zone : 1/10 ».

**Les seuils ne sont pas des réglages.** Le cahier veut des seuils paramétrables (§4) **et**
des limites que l'utilisateur ne peut pas forcer (MED-05). Les deux ne tiennent ensemble
que si le paramètre vit dans le code : une constante nommée de `pain/rules.py`, modifiable
par un commit, pas par un écran. Un réglage à l'écran serait exactement la porte que
MED-05 ferme.

---

## 2. Les données — `body/pain.csv`

Famille *mesure* : une ligne sans date ne se relit pas. Une ligne par **relevé**, et un
**épisode** regroupe le relevé qui ouvre et ses suivis.

| Colonne | Type | Rôle |
|---|---|---|
| `pain_id` | texte | Identifiant **stable** de l'épisode, généré à l'ouverture, jamais régénéré. Un suivi porte celui de son épisode |
| `date` | date | Le jour du relevé |
| `report` | `pain` · `none` | `none` : « pas de douleur » déclaré pour une sortie — la donnée qui manquera le plus à R4 si on ne l'écrit pas |
| `zone` | texte | Libre, 60 signes ; vide sur `none` |
| `side` | `left` · `right` · `both` · `na` | |
| `intensity` | 0–10 | |
| `baseline` | 0–10, vide sur un suivi | Le niveau d'avant la séance, demandé à l'ouverture |
| `moment` | `during` · `after` · `next_day` · `rest` | Pendant, après, le lendemain, au repos |
| `kind` | `dull` · `sharp` · `pulling` · `burning` · `stiff` · `other` | `sharp` = « vive » |
| `limp` | booléen | Boiterie |
| `run_id` | texte, facultatif | La sortie liée, par son identifiant **stable** |
| `note` | texte | |
| `source` | `import` · `morning` · `manual` | Où le relevé a été pris |

**Un suivi ne redemande que l'intensité**, le moment, le type et la boiterie — le moment
se choisit, il n'a de défaut ni côté client ni côté serveur. La zone, le côté et la base
sont ceux de l'épisode, jamais recopiés sur la ligne du suivi.

---

## 3. La réponse — `pain/rules.py`, module pur

Des relevés en entrée, un état par épisode en sortie. Aucune lecture, aucune horloge : le
jour est passé en argument, comme `coach/frame.py`.

```
fermé    dernier relevé ≤ base
arrêt    dernier relevé ≥ 7  ou  vive  ou  boiterie  ou  en hausse sur le précédent
adapté   sinon
```

`STOP_AT = 7`. Un épisode **fermé** reste dans l'historique, ne compte plus. Un relevé
d'ouverture déjà à sa base ouvre un épisode fermé d'emblée : la gêne est notée, rien ne
change.

Le texte rendu nomme le principe (Silbernagel), dit ce que le coach en fait, et
**n'emploie aucun nom de pathologie** (MED-06). Il n'évoque **jamais** les urgences : la
liste des vrais signaux d'alerte attend un professionnel, et d'ici là la réponse la plus
forte est l'arrêt et le praticien.

| État | Ce que dit l'écran |
|---|---|
| adapté | « Gêne (Achille, droit), 3/10 pour une base à 1. Séance adaptée : du facile, sans hausse de volume, et un suivi chaque matin jusqu'à son retour à la base. Repère : suivi de la douleur (Silbernagel) — elle doit revenir à sa base le lendemain. » |
| arrêt | « Douleur (Genou, gauche), 7/10 : au seuil d'arrêt et vive. Arrêt de la course jusqu'à son retour à la base, et un rendez-vous chez ton praticien. » |
| fermé | « Revenue à sa base le 21/10. » |

---

## 4. La prise sur le coach

`frame.State` gagne `pain: "none" | "adapt" | "stop"` et la phrase de l'épisode le plus
sévère. `frame.build` :

- **adapté** → `easy_only` et `hold` : du facile, la durée plafonnée à la médiane.
- **arrêt** → `allowed = ("rest",)`. `default_choice` rend le repos.

La phrase va dans `reasons`, donc à l'écran et dans la consigne du modèle — sans rien
écrire de plus dans `prompt.py`.

**La proposition déjà faite est réévaluée**, comme pour la forme du matin : `CoachService.view`
transforme une séance dure en facile si l'épisode est adapté, et toute séance en repos s'il
est à l'arrêt. C'est le « séance suivante remplacée » de CA-09, sans rappeler le modèle.

Ce qui n'est **pas** touché : le planning (`plan.csv`). Une séance prévue reste prévue ; le
coach la remplace dans sa proposition. Réécrire le planning est R6, avec un oui/non.

---

## 5. Les surfaces

### Backend

- `domains/pain/` — `models.py`, `schemas.py`, `rules.py`, `service.py`, `router.py`.
- `GET /api/pain` — épisodes ouverts avec leur état, historique, zones déjà employées.
- `POST /api/pain` — un relevé ; sans `pain_id`, il ouvre un épisode.
- `POST /api/pain/none` — « pas de douleur » pour une sortie.
- `DELETE /api/pain/{id}` sous `If-Match`.
- `coach/frame.py`, `coach/service.py` — §4.
- `morning/` — une étape `pain`, « Ta douleur », **présente seulement** s'il y a un épisode
  ouvert sans relevé du jour, placée après la nuit.
- `notifications/reminders.py` — `ReminderKind.PAIN`, à 12 h, ouvre `/corps`. Le texte dit
  ce qui n'est pas noté : « Ta douleur à l'Achille droit n'est pas notée aujourd'hui. »
- `assistant/context.py` — les épisodes ouverts entrent dans le contexte.

### Frontend

- `features/pain/api.ts` — types et appels.
- `routes/body/Pain.tsx` — la section de `/corps` : épisodes ouverts, leur phrase, « Noter
  aujourd'hui », « Nouvelle douleur » datée (pour saisir l'historique de CA-01),
  historique en `SwipeRow`.
- Le formulaire de relevé, un seul composant pour les trois endroits — import, matin,
  `/corps` — comme `RateRun` pour l'effort perçu.
- `NewActivitySheet.tsx` — après l'effort perçu : « Une douleur ? » Non / Oui.

---

## 6. Ce que ce lot ne fait pas

- **Corriger un relevé.** Il se supprime et se ressaisit ; une correction en place viendra
  si le besoin se montre. Le suivi ressaisi garde son `pain_id`.
- **La natation et le renfo** : le relevé n'est demandé qu'à l'import d'une course. Une
  douleur hors course se saisit dans `/corps`.
- **Bloquer la natation ou le renfo** sur un arrêt : le cadre du coach ne porte que la
  course.
- **La dictée** : R8. **Les patterns** : R4. **La frise sur la charge** : R10.

---

## 7. Vérifier

- `make check` vert.
- CA-09 rejoué en test de service : 3/10 vive=non → adapté, suivi dû le lendemain, aucune
  mention d'urgence ; 7/10 vive → arrêt, la proposition du coach devient repos.
- Les écrans à 402 et 360 px, dans les deux thèmes ; la feuille d'import ajoutée à
  `audit-surfaces.mjs` si elle n'y est pas déjà.

---

## 8. Journal

### R1 livré (19 octobre 2026)

Livré tel que planifié, avec trois écarts :

- **Les phrases ont changé d'ordre.** « Douleur vive et en hausse depuis le 17/10 (Genou,
  gauche) » mettait la zone après les signes ; la phrase dit maintenant la zone, le chiffre,
  puis les signes. « Un suivi demain matin » était faux quand le suivi était dû le jour
  même : « un suivi chaque matin jusqu'à son retour à la base ».
- **Le signe du seuil s'écrit « au seuil d'arrêt ».** « 7/10 : à 7/10 ou plus » répétait
  le chiffre.
- **Le parcours du matin dit son nombre d'écrans.** « Quatre écrans » était écrit en dur ;
  un matin de suivi en compte cinq.

#### Ce que le passage à l'écran a trouvé

La batterie était verte — 2 169 tests backend, 758 tests d'écran — et trois défauts se
voyaient à l'œil, sur la vraie API branchée à un WebDAV en mémoire, à 402 et 360 px, dans
les deux thèmes :

1. **Le titre d'un épisode gardait les parenthèses de la phrase** : « (ACHILLE, DROIT) »,
   en capitales. Le serveur sert désormais deux libellés, `place` pour une phrase et
   `title` pour un titre — « Achille · droit ».
2. **À 360 px, un relevé se cassait sur trois lignes** — « 6/10 · le / lendemain · /
   vive » —, la date lui prenant la moitié de la largeur. La date passe sous le résumé.
3. **« Suivi (Achille, droit). »** répétait, au-dessus du formulaire, ce que le titre de la
   carte et la phrase du serveur venaient de dire. Retiré.

Les mesures, elles, étaient propres d'emblée : aucune cible sous 44 px, aucun débordement,
aucun champ sous 16 px, sur douze captures.

#### Laissé, et pourquoi

- **Rien n'a été vérifié sur un vrai téléphone**, comme pour le reste du dépôt.
- **Le push de midi n'a pas été reçu** : il est testé par sa composition (`compose`) et
  son créneau, pas par un envoi réel.
- **La section Douleurs vit en bas de `/corps`.** Un épisode ouvert est ce que le coach lit
  en premier ; s'il faut le remonter, c'est une décision d'écran à prendre en regardant
  l'usage, pas avant.

