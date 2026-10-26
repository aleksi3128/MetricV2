# Assistant — `/assistant`

**Rôle.** Parler à l'application : poser une question sur ses données, et faire écrire
l'assistant à sa place — « note ma séance de ce matin » remplace une navigation et un
formulaire.

**Comment on y arrive.** Onglet « Assistant » (barre basse) ; entrée de la barre du haut
sur ordinateur ; la lecture du jour (`?fil=…`) ; « Demander à l'assistant » sur
`/objectif`. Les adresses `?ouvre=discussions`, `?ouvre=memoire` (le carnet) et
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
| En-tête | Titre du fil ; boutons **Mémoire** et **Discussions** | `GET /api/assistant/threads/{id}` | « Nouvelle discussion » |
| Fil | Questions et réponses ; sous chaque réponse : copier, **Écouter**, réessayer ; le condensé envoyé, replié ; les comptes rendus d'actions (annuler un ajout, confirmer un changement, oublier une note) ; une séance Cadence proposée s'affiche en `CircuitCard` | `POST /api/assistant/chat/stream` | « Pose ta question : le fil commence ici. » ; sans clé : « Assistance indisponible », le carnet reste utilisable |
| Saisie | Champ de question, **Dicter ta question**, Envoyer | — | désactivée sans clé |

## 2. Les deux feuilles

| Feuille | Contenu | Écrit |
|---|---|---|
| **Tes discussions** | Nouvelle discussion ; les précédentes, à rouvrir, renommer, oublier | `PATCH/DELETE /api/assistant/threads/{id}` |
| **Ce que l'assistant sait de toi** — deux onglets (M-05) | **Profil** (« Ce que je suis » : taille, année de naissance, jours d'entraînement, matériel, préférences, contraintes ; aperçu de ce qui part au modèle ; **Enregistrer le profil**) et **Carnet**, ouvert par défaut (les notes par sujet ; corriger, oublier, marquer résolu ; « Noter quelque chose ») | `PUT /api/assistant/profile` sous `If-Match` ; `POST/PATCH/DELETE /api/assistant/memory` |

## 3. Ce que l'assistant sait écrire

Treize actions ([`actions.py:542`](../../backend/app/domains/assistant/actions.py#L542)).

| S'exécutent et s'annulent | Demandent un appui |
|---|---|
| noter une pesée, une boisson, un repas du jour, une course | supprimer une pesée, un repas, une course |
| cocher un supplément du jour | décaler une séance prévue, la retirer |
| créer une séance Cadence ; prévoir une séance | proposer des séances au planning, une par une — **seulement dans le fil de `/planning`** |

## 4. Liens sortants

« Ouvrir dans Cadence » sur une séance proposée ; aucun lien vers les autres écrans.

## 5. Constats

- **Ce que l'assistant ne sait pas écrire** est justement ce qui se dit le mieux à voix
  haute : une **douleur** (« j'ai mal au genou gauche depuis la sortie »), une **natation**,
  une **mensuration**, un **effort perçu**. La douleur dictée existe — dans `PainForm`, sur
  `/corps` — mais pas dans le fil (M-10).
- ~~**« Ce que l'assistant sait de toi » vit à deux endroits.**~~ Corrigé (M-05,
  `58cf652`) : profil et carnet sont deux onglets de la même feuille ; « Ce que je suis »
  a quitté `/reglages`. Quand rien n'existe avec le matériel déclaré, la consigne du
  modèle envoie vers « Mémoire, onglet Profil ».
- **Un second fil d'assistant vit sur `/planning`** (« Demander au planning », M-13), avec ses
  propres suggestions et son propre historique (`GET /api/assistant/threads/planning`). Il
  n'apparaît pas dans « Tes discussions » — c'est le seul fil qu'on ne retrouve pas ici.
- « noter un repas **du jour** » : l'assistant ne rattrape pas plus que `/nutrition` un repas
  d'hier (M-01).

## 6. Non vu

Une réponse réelle de modèle, une action exécutée puis annulée, la dictée (Chrome headless
n'a pas de micro) ; décrits depuis le code.
