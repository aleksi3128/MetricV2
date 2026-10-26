# Réglages — `/reglages`, « Objectifs & repères »

**Rôle.** Tout ce qui se règle une fois : cibles quotidiennes, repères de course, pistes
d'assiduité, glossaire de nage, rappels, sécurité, apparence. Le profil pour l'assistant
est parti à côté du carnet (M-05).

**Comment on y arrive.** « Plus » → Compte → Réglages ; entrée de la barre du haut sur
ordinateur ; liens depuis `/assiduite` (pistes), `/activite/seances` (adresse de Cadence),
la page d'une course (zones).

Fichiers : [`Settings.tsx`](../../frontend/src/routes/Settings.tsx),
[`settings/`](../../frontend/src/routes/settings/) — `Tracks`, `SwimCodes`, `Reminders`,
`Escalation`, `Security`. `Profile` est passé dans `routes/assistant/` (M-05).

---

## 1. Ce que l'écran montre — dans l'ordre de la page

Haut d'écran rempli : **11 357 px** à l'inventaire, l'écran le plus long de l'application ;
**9 785** depuis M-05, sur le banc du 26 octobre (11 235 avant) — voir le `README`.

| Section | Contenu | Source | Écrit |
|---|---|---|---|
| **Objectifs** | Cible de poids, protéines, plafond de sucres, calories, eau ; l'origine de chaque valeur (réglée ou défaut serveur) | `GET /api/settings` | `PATCH /api/settings` (une barre « Enregistrer » collante pour toutes les sections de ce bloc) |
| **Saisie** | Volumes des raccourcis d'eau ; clé de la piste mise en avant | même appel | même |
| **Applications** | Adresse de Cadence | même appel | même |
| **Course** | FC max, allure seuil (vides : déduites des sorties) | même appel | même |
| **Pistes d'assiduité** | Les pistes : source, seuil, cadence ; modifier (avec aperçu du recalcul), descendre, mettre en avant, supprimer, ajouter | `GET /api/heatmap/tracks` | `POST/PATCH/DELETE /api/heatmap/tracks…` |
| **Jours neutralisés** | Piste, du, au, raison ; rétablir | `GET /api/heatmap/off-days` | `POST/DELETE /api/heatmap/off-days` |
| ~~**Ce que je suis**~~ | Parti dans la feuille de l'assistant, onglet Profil (M-05, `58cf652`) : `/assistant?ouvre=profil` | — | — |
| **Natation** | Le glossaire de la notation : nages, allures, matériel ; renommer, rétablir, ajouter un sigle | `GET /api/planning/swim/codes` | `POST/PATCH/DELETE /api/planning/swim/codes` |
| **Rappels** | Abonnement de l'appareil, essai ; une heure par rappel (suppléments, hydratation, repas, protéines, séance) | `GET /api/notifications` | `PATCH /api/notifications/reminders`, `/subscribe`, `/test` |
| Point du soir | Fenêtre, relance, report, heures calmes ; couper | même appel | `PATCH /api/notifications/escalation` |
| **Sécurité et données** | Passkeys ; export complet ; dernière sauvegarde ; usage de l'IA du mois et son plafond | `GET /api/passkey`, `GET /api/account` | passkey ; `GET /api/export` |
| **Apparence** | Système / clair / sombre (dans ce navigateur seulement) | — | `localStorage` |
| **Assistance** | État de l'IA | `GET /api/ai/status` | — |

## 2. Constats

- **Une page qui en contient sept** — six depuis que le profil a rejoint l'assistant (M-05,
  `58cf652`). Ses sections appartiennent chacune à un autre écran :
  les pistes et les jours neutralisés à `/assiduite`, ~~le profil à l'assistant~~, le glossaire
  au planning, la FC max et l'allure seuil aux pages de course, l'adresse de Cadence aux
  séances, la cible d'eau et ses raccourcis à `/routine`. Chacune est atteinte par un lien
  « Aller aux réglages » qui atterrit en haut d'une page de 11 357 px (M-04 ; voisin de
  `sortie-publique.md` §4.14).
- **Le titre « Objectifs & repères » est celui de la première section**, pas de la page ;
  et « Objectifs » y désigne des cibles quotidiennes, pas l'objectif daté de `/objectif`
  (M-13).
- **La synchro Garmin n'a aucune place à l'écran.** Le serveur sert son état et un
  « synchroniser maintenant » (`GET/POST /api/sync`) ; on ne les lit qu'en `make status`
  et `make sync`, au terminal. La dernière nuit reçue, elle, s'affiche sur l'accueil (M-18).
- **Le matériel du profil est en anglais** (`body weight`, `dumbbell`, `ez barbell`…) :
  ce sont les noms du catalogue Cadence, affichés tels quels. Le constat suit le profil
  dans la feuille de l'assistant.

## 3. Non vu

Notifications et passkey réellement configurées (le banc n'a ni clé VAPID ni
`PASSKEY_RP_ID`) ; une sauvegarde.
