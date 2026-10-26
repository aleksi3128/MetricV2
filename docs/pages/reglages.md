# Réglages — `/reglages`, « Réglages »

**Rôle.** Ce qui vaut pour toute l'application : les cibles quotidiennes qui servent à
plusieurs écrans, les rappels, la sécurité et les données, l'apparence, l'état de l'IA.
Depuis M-04, chaque réglage propre à un écran se règle sur cet écran (§2).

**Comment on y arrive.** « Plus » → Référence → Réglages ; entrée de la barre du haut sur
ordinateur. Aucun écran n'y renvoie plus : les liens « Aller aux réglages » de
`/activite/seances`, de `/assiduite` et de la page d'une course mènent désormais à l'endroit
où le réglage a déménagé.

Fichiers : [`Settings.tsx`](../../frontend/src/routes/Settings.tsx),
[`settings/`](../../frontend/src/routes/settings/) — `Reminders`, `Escalation`, `Security`.
Le formulaire s'appuie sur
[`features/settings/useSettingsDraft.ts`](../../frontend/src/features/settings/useSettingsDraft.ts),
la brique partagée par tous les formulaires de `settings.csv` (§3).

---

## 1. Ce que l'écran montre — dans l'ordre de la page

Haut d'écran : **4 771 px**, rempli comme vide, sur le banc du 26 octobre après M-04
(9 847 avant sur ce banc ; 11 357 à l'inventaire) — voir le `README`.

| Section | Contenu | Source | Écrit |
|---|---|---|---|
| **Cibles** | Poids cible, protéines, plafond de sucres, calories ; l'origine de chaque valeur (réglée ou défaut serveur) | `GET /api/settings` | `PATCH /api/settings` (ses quatre clés seulement), barre « Enregistrer » collante dès qu'un champ change |
| **Rappels** | Abonnement de l'appareil, essai ; une heure par rappel (suppléments, hydratation, repas, protéines, séance) | `GET /api/notifications` | `PATCH /api/notifications/reminders`, `/subscribe`, `/test` |
| Point du soir | Fenêtre, relance, report, heures calmes ; couper | même appel | `PATCH /api/notifications/escalation` |
| **Sécurité et données** | Passkeys ; export complet ; dernière sauvegarde ; usage de l'IA du mois et son plafond | `GET /api/passkey`, `GET /api/account` | passkey ; `GET /api/export` |
| **Apparence** | Système / clair / sombre (dans ce navigateur seulement) | — | `localStorage` |
| **Assistance** | État de l'IA | `GET /api/ai/status` | — |

## 2. Ce qui est parti, et où

| Réglage | Nouvelle place | Lot |
|---|---|---|
| Ce que je suis (profil de l'assistant) | `/assistant`, feuille « Ce que l'assistant sait de toi », onglet Profil | M-05 (`58cf652`) |
| Adresse de Cadence | `/activite/seances` : la carte d'en tête quand elle manque, une ligne de pied une fois réglée | M-04 (`96f1f8f`) |
| FC max, allure seuil | `/activite/courses`, section « Repères » repliée ; `#reperes` l'ouvre | M-04 (`1d05b4d`) |
| Cible d'eau, volumes des raccourcis | `/routine`, pied de la carte Hydratation, « Régler » | M-04 (`3d5c8c8`) |
| Glossaire de nage | `/planning/sigles` | M-04 (`58ba44b`) |
| Pistes d'assiduité, jours neutralisés, piste mise en avant | `/assiduite`, feuille « Régler les pistes » | M-04 (`4d902ce`) |

Le champ texte « Clé de la piste » (`heatmap_metric`) n'a pas d'équivalent : « Mettre en
avant », sur chaque piste de la feuille, écrit le même réglage.

## 3. Un fichier, un jeton

Les objectifs, les réglages partis, le profil de l'assistant et les créneaux de rappel vivent
dans `settings.csv`, sous **un seul jeton `If-Match`**. Chaque formulaire — ici, sur
`/routine`, `/activite/courses`, `/activite/seances`, dans la feuille de l'assistant —
envoie sa propre `PATCH` avec ses seules clés et le jeton de la lecture en cache, la même
pour tous. Toute écriture dans le fichier (y compris « Mettre en avant » une piste, que le
serveur écrit par sa propre route) invalide les trois lectures : réglages, profil, rappels.
Un conflit s'affiche ; il ne se force pas. Preuve : `routes/SettingsFile.test.tsx`.

## 4. Constats

- ~~**Une page qui en contient sept.**~~ Corrigé (M-04, M-05) : il n'y reste que ce qui ne
  règle aucun écran en particulier.
- ~~**Le titre « Objectifs & repères » est celui de la première section.**~~ La page
  s'appelle « Réglages », et sa section « Cibles » (M-13, `21a1672`) : « Objectif » ne
  désigne plus que l'objectif daté de `/objectif`.
- **La synchro Garmin n'a aucune place à l'écran.** Le serveur sert son état et un
  « synchroniser maintenant » (`GET/POST /api/sync`) ; on ne les lit qu'en `make status`
  et `make sync`, au terminal. La dernière nuit reçue, elle, s'affiche sur l'accueil (M-18).
- **La barre « Enregistrer » collante** (fiche 24 de l'audit) reste ici seulement : les
  formulaires déplacés ont deux champs au plus, sous leur bouton.

## 5. Non vu

Notifications et passkey réellement configurées (le banc n'a ni clé VAPID ni
`PASSKEY_RP_ID`) ; une sauvegarde.
