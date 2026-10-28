# Assistant — `/assistant`

**Rôle.** Parler à l'application : poser une question sur ses données, et faire écrire
l'assistant à sa place — « note ma séance de ce matin » remplace une navigation et un
formulaire.

**Comment on y arrive.** Onglet « Assistant » (barre basse) ; entrée de la barre du haut
sur ordinateur ; la lecture du jour (`?fil=…`) ; « Demander à l'assistant » sur
`/objectif` ; « Ouvrir le fil du planning » sur `/planning` (`?portee=planning`, M-20). Les adresses `?ouvre=discussions`, `?ouvre=memoire` (le carnet) et
`?ouvre=profil` (M-05) ouvrent leur feuille ; plus aucun écran n'y mène depuis que la
rangée de l'accueil est partie (M-22, `fc178f8`), elles servent aux favoris.

Fichiers : [`Assistant.tsx`](../../frontend/src/routes/Assistant.tsx),
[`assistant/Conversation.tsx`](../../frontend/src/routes/assistant/Conversation.tsx),
[`assistant/useConversation.ts`](../../frontend/src/routes/assistant/useConversation.ts),
[`assistant/ThreadSheet.tsx`](../../frontend/src/routes/assistant/ThreadSheet.tsx),
[`assistant/MemorySheet.tsx`](../../frontend/src/routes/assistant/MemorySheet.tsx),
[`assistant/Profile.tsx`](../../frontend/src/routes/assistant/Profile.tsx) ;
serveur [`domains/assistant/actions.py`](../../backend/app/domains/assistant/actions.py).

---

## 1. Ce que l'écran montre

Un fil plein écran, une saisie collée en bas. 875 px : l'écran tient exactement dans la
hauteur.

| Bloc | Ce qu'il montre | Source | Vide / erreur |
|---|---|---|---|
| En-tête | Titre du fil ; boutons **Mémoire** et **Discussions** | `GET /api/assistant/threads/{id}` | « Nouvelle discussion » ; « Planning » dans le fil du planning |
| Fil du planning (M-20) | En tête du fil, ce qu'il fait et **Voir le planning** ; au-dessus de la saisie, champ vide, trois débuts de question (« Ma semaine de natation », « Une séance technique », « Ajuste à ce que j'ai nagé ») qui remplissent le champ. Rien de cela dans un fil ordinaire | `GET /api/assistant/threads/planning` (par `?portee=planning`), ou la portée du fil rouvert | attente dessinée pendant qu'il se cherche ; « Fil du planning illisible » |
| Fil | Questions et réponses ; sous chaque réponse : copier, **Écouter**, réessayer ; le condensé envoyé, replié ; les comptes rendus d'actions (annuler un ajout, confirmer un changement, oublier une note) ; une séance Cadence proposée s'affiche en `CircuitCard` | `POST /api/assistant/chat/stream` ; un fil existant, `GET /api/assistant/threads/{id}` | « Pose ta question : le fil commence ici. » ; un fil qui se lit : squelette ; illisible : « Fil illisible » et le message du serveur (`b252a98`) ; sans clé : « Assistance indisponible », le carnet reste utilisable |
| Saisie | Champ de question, **Dicter ta question**, Envoyer | — | désactivée sans clé |

## 2. Les deux feuilles

| Feuille | Contenu | Écrit |
|---|---|---|
| **Tes discussions** | Nouvelle discussion ; les précédentes, à rouvrir, renommer, oublier | `PATCH/DELETE /api/assistant/threads/{id}` |
| **Ce que l'assistant sait de toi** — deux onglets (M-05) | **Profil** (« Ce que je suis » : taille, année de naissance, jours d'entraînement, matériel, préférences, contraintes ; aperçu de ce qui part au modèle ; **Enregistrer le profil**) et **Carnet**, ouvert par défaut (les notes par sujet ; corriger, oublier, marquer résolu ; « Noter quelque chose ») | `PUT /api/assistant/profile` sous `If-Match` ; `POST/PATCH/DELETE /api/assistant/memory` |

## 3. Ce que l'assistant sait écrire

Seize actions ([`actions.py`](../../backend/app/domains/assistant/actions.py), `catalogue()`).

| S'exécutent et s'annulent | Demandent un appui |
|---|---|
| noter une pesée, une boisson, une course | supprimer une pesée, un repas, une course |
| noter un repas, du jour **ou d'hier** (M-10) | décaler une séance prévue, la retirer |
| noter une **douleur** — du jour ou de la veille —, ou son suivi (M-10) | proposer des séances au planning, une par une — **seulement dans le fil du planning**, qui s'y confirment seulement (M-20) |
| noter une **natation**, dans la notation lue par le serveur (M-10) | remplacer l'**effort perçu** d'une séance qui en a déjà un (M-10) |
| noter l'**effort perçu** d'une séance du jour qui n'en a pas — « Annuler » le remet à vide (M-10) | |
| cocher un supplément du jour ; créer une séance Cadence ; prévoir une séance | |

L'annulation est le geste que l'écran ferait lui-même : la suppression de la ligne, ou pour
un effort perçu `PUT …/{id}/rpe` à vide. Le serveur rend le geste entier (`UndoRef` :
méthode, suffixe, corps) ; l'écran n'apprend aucune action par son nom — pas même
`plan.propose`, reconnue à ses `sessions` depuis `b252a98`. Un refus porte son `code`, et
l'écran en lit un : un conflit `If-Match` à la confirmation retire « Confirmer », le conflit
ne se force pas. Une action demandée hors de sa portée dit son geste et où il se fait
(« Je ne sais pas proposer des séances au planning dans cette discussion : seulement dans le
fil du planning »), plus son nom technique.

## 4. Liens sortants

« Ouvrir dans Cadence » sur une séance proposée ; dans le fil du planning, **Voir le
planning** (en tête) et **Voir au planning** sous une adoption, sur le premier jour écrit
(`/planning?jour=…`, M-20) ; **Voir au planning** aussi sous une séance prévue
(`plan.add`) et sous une séance décalée, une fois confirmée (`plan.move`), depuis
`b252a98`.

## 5. Constats

- ~~**Ce que l'assistant ne sait pas écrire** est justement ce qui se dit le mieux à voix
  haute : une **douleur**, une **natation**, un **effort perçu**.~~ Corrigé (M-10,
  `21fb4f4`, `84977aa`, `26b8e68`, `388937f`, `0c4c28d`) : `pain.add`, `swim.add`,
  `effort.rate`, vus dans le fil à 402 px dans les deux thèmes, annulés au toucher. Reste
  la **mensuration**, que la fiche laissait attendre.
- ~~**« Ce que l'assistant sait de toi » vit à deux endroits.**~~ Corrigé (M-05,
  `58cf652`) : profil et carnet sont deux onglets de la même feuille ; « Ce que je suis »
  a quitté `/reglages`. Quand rien n'existe avec le matériel déclaré, la consigne du
  modèle envoie vers « Mémoire, onglet Profil ».
- **Un second fil d'assistant vit sur `/planning`** (« Demander au planning », M-13), avec ses
  propres suggestions et son propre historique (`GET /api/assistant/threads/planning`). Il
  n'apparaît pas dans « Tes discussions » — c'est le seul fil qu'on ne retrouve pas ici.
  *Relu le 28 octobre (M-10) : c'est inexact.* Le fil y est listé, marqué « planning · »,
  depuis `01da357` (`test_the_list_marks_the_planning_thread_and_does_not_resume_it`) ;
  seule la réouverture automatique l'écarte (`_resumable`). Ce qui reste de M-20, c'est
  l'entrée depuis `/planning` à la place du fil. ~~Fait~~ (M-20, `bbacdd7`) : l'entrée
  ouvre ce fil ici ; il se reconnaît (titre, mention, suggestions), se quitte par la feuille
  comme un autre, et ses propositions ne se confirment que dans sa portée (`685c4af`). En
  route : la feuille ne voyait pas un fil qu'une réponse venait d'ouvrir — l'invalidation de
  M-10 épargnait la liste avec le fil ; elle se relit seule depuis.
- ~~« noter un repas **du jour** » : l'assistant ne rattrape pas plus que `/nutrition` un
  repas d'hier (M-01).~~ Corrigé (M-10, `21fb4f4`) : `meal.add` prend `day`.

## 6. Non vu

Une réponse réelle de modèle et la dictée (Chrome headless n'a pas de micro) ; décrites
depuis le code. Les quatre actions de M-10, elles, ont été exécutées puis annulées au
toucher sur le banc, avec des réponses de modèle écrites à la main.
